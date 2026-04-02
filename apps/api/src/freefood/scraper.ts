/**
 * FREEFOOD LISTSERV RSS scraper.
 *
 * Ported from TheForum's Python scraper (scrape_listserv.py).
 * Authenticates with Princeton LISTSERV, fetches the FREEFOOD RSS feed,
 * parses emails, fetches image attachments from message pages, and
 * upserts them into a local SQLite database.
 *
 * Required env vars:
 *   LISTSERV_EMAIL       — e.g. tigerapp@princeton.edu
 *   LISTSERV_PASSWORD    — LISTSERV password
 *   OPENROUTER_API_KEY   — for LLM location matching (optional)
 */

import { Database } from "bun:sqlite";
import { XMLParser } from "fast-xml-parser";
import path from "node:path";
import { matchLocations } from "./locations.js";

const BASE_URL = "https://lists.princeton.edu/cgi-bin/wa";

let cookie = "";
let authParams = "";

// ── helpers ──────────────────────────────────────────────────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  let text = decodeEntities(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<p[^>]*>/gi, "\n");
  text = text.replace(/<\/p>/gi, "");
  text = text.replace(/<li[^>]*>/gi, "\n\u2022 ");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function parseHoagiemail(bodyHtml: string): { name: string; email: string } | null {
  const match = bodyHtml.match(/Email composed by\s+(.+?)\s+\((\S+@\S+)\)/);
  return match ? { name: match[1], email: match[2] } : null;
}

// ── auth ─────────────────────────────────────────────────────────────

async function login(): Promise<void> {
  const email = process.env.LISTSERV_EMAIL || "";
  const password = process.env.LISTSERV_PASSWORD || "";

  if (!email || !password) {
    throw new Error("LISTSERV_EMAIL and LISTSERV_PASSWORD env vars required");
  }

  const body = new URLSearchParams({
    LOGIN1: "",
    Y: email,
    p: password,
    e: "Log In",
    X: "",
  });

  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "TigerMap-Scraper/1.0",
    },
    body: body.toString(),
    redirect: "manual",
  });

  const html = await resp.text();

  const setCookie = resp.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/WALOGIN=([^;]+)/);
  const xMatch = html.match(/X=([A-F0-9]{16,})/);

  if (!cookieMatch || !xMatch) {
    throw new Error("Login failed — check LISTSERV_EMAIL / LISTSERV_PASSWORD");
  }

  cookie = `WALOGIN=${cookieMatch[1]}`;
  authParams = `X=${xMatch[1]}&Y=${encodeURIComponent(email)}`;
}

async function makeRequest(url: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Cookie: cookie, "User-Agent": "TigerMap-Scraper/1.0" },
      });
      return await resp.text();
    } catch (e) {
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      } else {
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}

/**
 * Fetch a LISTSERV image with fresh auth. Used by the image proxy route.
 * Strips old auth params from the stored URL and re-authenticates.
 */
export async function fetchAuthenticatedImage(storedUrl: string): Promise<ArrayBuffer | null> {
  try {
    if (!cookie || !authParams) await login();

    // Strip old auth params (X=...&Y=...) and re-add fresh ones
    const cleaned = storedUrl
      .replace(/&X=[A-F0-9]+/i, "")
      .replace(/&Y=[^&]+/, "");
    const sep = cleaned.includes("?") ? "&" : "?";
    const url = `${cleaned}${sep}${authParams}`;

    const resp = await fetch(url, {
      headers: { Cookie: cookie, "User-Agent": "TigerMap-Scraper/1.0" },
    });

    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (ct.startsWith("text/html")) {
      // Session expired — re-login and retry once
      await login();
      const retryUrl = `${cleaned}${sep}${authParams}`;
      const resp2 = await fetch(retryUrl, {
        headers: { Cookie: cookie, "User-Agent": "TigerMap-Scraper/1.0" },
      });
      if (!resp2.ok) return null;
      const ct2 = resp2.headers.get("content-type") || "";
      if (ct2.startsWith("text/html")) return null;
      return await resp2.arrayBuffer();
    }

    return await resp.arrayBuffer();
  } catch {
    return null;
  }
}

// ── Image attachment fetching ────────────────────────────────────────

/**
 * Fetch a LISTSERV message page and extract image attachment URLs.
 * Ported from TheForum's fetch_full_message().
 */
async function fetchImageAttachments(messageUrl: string): Promise<string[]> {
  try {
    const sep = messageUrl.includes("?") ? "&" : "?";
    const url = `${messageUrl}${sep}${authParams}`;
    let page = await makeRequest(url);

    // Re-login if session expired
    if (page.includes("Login Required")) {
      await login();
      page = await makeRequest(`${messageUrl}${sep}${authParams}`);
      if (page.includes("Login Required")) return [];
    }

    // Find all A3 attachment links: href="/cgi-bin/wa?A3=..." with their label
    const a3Links = [...page.matchAll(/href="(\/cgi-bin\/wa\?A3=[^"]+)"[^>]*>([^<]+)<\/a>/g)];

    const imageUrls: string[] = [];
    const seen = new Set<string>();

    for (const [, link, label] of a3Links) {
      const name = label.trim().toLowerCase();
      // Match MIME types (image/png) or filenames with image extensions
      const isImage =
        name.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i.test(name);
      if (isImage) {
        const fullUrl = `https://lists.princeton.edu${link}`;
        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          imageUrls.push(fullUrl);
        }
      }
    }

    return imageUrls;
  } catch {
    return [];
  }
}

// ── RSS parsing ──────────────────────────────────────────────────────

export interface FreefoodEmail {
  message_id: string;
  subject: string;
  author_name: string;
  author_email: string;
  date: string;
  date_raw: string;
  body_html: string;
  body_text: string;
  links: string[];
  images: string[];
  is_hoagiemail: boolean;
  hoagiemail_sender_name: string | null;
  hoagiemail_sender_email: string | null;
  listserv_url: string;
}

async function fetchRss(limit = 500): Promise<FreefoodEmail[]> {
  const url = `${BASE_URL}?RSS&L=FREEFOOD&v=2.0&LIMIT=${limit}&${authParams}`;
  const data = await makeRequest(url);

  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
    processEntities: false,
    htmlEntities: true,
  });
  const parsed = parser.parse(data);

  let items = parsed?.rss?.channel?.item || parsed?.["rdf:RDF"]?.item || [];
  if (!Array.isArray(items)) items = items ? [items] : [];

  const emails: FreefoodEmail[] = [];
  for (const item of items) {
    const title = item.title || "";
    const link = item.link || "";
    const description = item.description || "";
    const authorRaw = item.author || "";
    const pubDate = item.pubDate || "";

    const authorMatch =
      authorRaw.match(/(.+?)\s*<(.+?)>/) || authorRaw.match(/(.+?)\s*&lt;(.+?)&gt;/);
    const authorName = authorMatch ? authorMatch[1].trim() : authorRaw;
    const authorEmail = authorMatch ? authorMatch[2].trim() : "";

    const msgIdMatch = link.match?.(/A2=([^&]+)/);
    const messageId = msgIdMatch ? msgIdMatch[1] : "";

    const bodyText = stripHtml(description);
    const hoagiemail = parseHoagiemail(description);

    const isHoagiemail =
      authorEmail.toUpperCase() === "HOAGIE@PRINCETON.EDU" || hoagiemail !== null;

    let isoDate = pubDate;
    try {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime())) isoDate = d.toISOString();
    } catch {
      /* keep raw */
    }

    emails.push({
      message_id: messageId,
      subject: title,
      author_name: authorName,
      author_email: authorEmail,
      date: isoDate,
      date_raw: pubDate,
      body_html: description,
      body_text: bodyText,
      links: [],
      images: [],
      is_hoagiemail: isHoagiemail,
      hoagiemail_sender_name: hoagiemail?.name ?? null,
      hoagiemail_sender_email: hoagiemail?.email ?? null,
      listserv_url: link,
    });
  }

  return emails;
}

// ── database ─────────────────────────────────────────────────────────

export function initFreefoodDb(dataDir: string): Database {
  const dbPath = path.join(dataDir, "freefood.sqlite");
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS freefood_emails (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id    TEXT UNIQUE NOT NULL,
      subject       TEXT NOT NULL,
      author_name   TEXT,
      author_email  TEXT,
      date          TEXT,
      date_raw      TEXT,
      body_html     TEXT,
      body_text     TEXT,
      links         TEXT DEFAULT '[]',
      images        TEXT DEFAULT '[]',
      is_hoagiemail INTEGER DEFAULT 0,
      hoagiemail_sender_name  TEXT,
      hoagiemail_sender_email TEXT,
      listserv_url  TEXT,
      location_name TEXT,
      location_lat  REAL,
      location_lng  REAL,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrations for existing databases
  const cols = db.prepare("PRAGMA table_info(freefood_emails)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("location_name")) {
    db.run("ALTER TABLE freefood_emails ADD COLUMN location_name TEXT");
    db.run("ALTER TABLE freefood_emails ADD COLUMN location_lat REAL");
    db.run("ALTER TABLE freefood_emails ADD COLUMN location_lng REAL");
  }

  db.run("CREATE INDEX IF NOT EXISTS idx_freefood_date ON freefood_emails(date DESC)");

  return db;
}

function upsertEmails(db: Database, emails: FreefoodEmail[]): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO freefood_emails (
      message_id, subject, author_name, author_email, date, date_raw,
      body_html, body_text, links, images, is_hoagiemail,
      hoagiemail_sender_name, hoagiemail_sender_email, listserv_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const e of emails) {
      const result = stmt.run(
        e.message_id,
        e.subject,
        e.author_name,
        e.author_email,
        e.date,
        e.date_raw,
        e.body_html,
        e.body_text,
        JSON.stringify(e.links),
        JSON.stringify(e.images),
        e.is_hoagiemail ? 1 : 0,
        e.hoagiemail_sender_name,
        e.hoagiemail_sender_email,
        e.listserv_url,
      );
      if (result.changes > 0) inserted++;
    }
  });
  tx();
  return inserted;
}

/**
 * Fetch image attachments for emails that don't have them yet.
 * Only processes recent emails (last 14 days) to avoid hammering the server.
 */
async function enrichImages(db: Database): Promise<number> {
  const rows = db
    .prepare(
      `SELECT id, listserv_url FROM freefood_emails
       WHERE images = '[]' AND listserv_url != ''
       AND date > datetime('now', '-14 days')
       ORDER BY date DESC`,
    )
    .all() as { id: number; listserv_url: string }[];

  if (rows.length === 0) return 0;

  console.log(`[freefood] Fetching image attachments for ${rows.length} emails...`);

  const updateStmt = db.prepare("UPDATE freefood_emails SET images = ? WHERE id = ?");
  let enriched = 0;

  for (const row of rows) {
    const imageUrls = await fetchImageAttachments(row.listserv_url);
    if (imageUrls.length > 0) {
      updateStmt.run(JSON.stringify(imageUrls), row.id);
      enriched++;
    }
    // Small delay to be respectful to the LISTSERV server
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[freefood] Found images for ${enriched}/${rows.length} emails`);

  // Inherit images from original emails to their "Re:" replies
  const inherited = db
    .prepare(
      `UPDATE freefood_emails
       SET images = (
         SELECT orig.images FROM freefood_emails orig
         WHERE orig.images != '[]'
           AND freefood_emails.subject LIKE 'Re: ' || orig.subject
         LIMIT 1
       )
       WHERE images = '[]'
         AND subject LIKE 'Re:%'
         AND date > datetime('now', '-14 days')
         AND EXISTS (
           SELECT 1 FROM freefood_emails orig
           WHERE orig.images != '[]'
             AND freefood_emails.subject LIKE 'Re: ' || orig.subject
         )`,
    )
    .run();
  if (inherited.changes > 0) {
    console.log(`[freefood] Inherited images for ${inherited.changes} reply emails`);
  }

  return enriched;
}

// ── public API ───────────────────────────────────────────────────────

export async function scrapeFreefood(
  db: Database,
  limit = 500,
): Promise<{ total: number; inserted: number }> {
  await login();
  const emails = await fetchRss(limit);
  const inserted = upsertEmails(db, emails);

  // Enrich new emails with images (runs in background, non-blocking for the scrape result)
  enrichImages(db).catch((err) => console.error("[freefood] Image enrichment failed:", err.message));

  // Match locations via LLM (also background)
  matchLocations(db).catch((err) =>
    console.error("[freefood] Location matching failed:", err.message),
  );

  return { total: emails.length, inserted };
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startAutoScraper(db: Database, intervalMs = 10 * 60 * 1000): void {
  const run = () =>
    scrapeFreefood(db)
      .then(({ total, inserted }) => {
        console.log(`[freefood] Scraped: ${inserted} new / ${total} from RSS`);
      })
      .catch((err) => {
        console.error("[freefood] Scrape failed:", err.message);
      });

  run();
  intervalId = setInterval(run, intervalMs);
  console.log(`[freefood] Auto-scraper started (interval: ${Math.round(intervalMs / 60000)}m)`);
}

export function stopAutoScraper(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
