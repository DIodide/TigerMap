/**
 * Eating club events scraper.
 *
 * Two modes:
 *  1. Import from TheForum's WHITMANWIRE JSON export (bulk, one-time)
 *  2. Ongoing RSS scraping from WHITMANWIRE listserv (same auth as FREEFOOD)
 *
 * Every new email is classified once by Gemini Flash Lite (verdicts are kept
 * in seen_messages). Only eating-club-related events are stored.
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  type ClassificationResult,
  EATING_CLUBS,
  classifyEmail,
  resolveClub,
} from "./classifier.js";

const BASE_URL = "https://lists.princeton.edu/cgi-bin/wa";

// Re-use LISTSERV auth from the freefood scraper (same credentials)
let cookie = "";
let authParams = "";

// ── helpers ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let text = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Unique http(s) image URLs referenced by an HTML body. */
function extractImages(html: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  for (const match of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/gi)) {
    const clean = match[1].replace(/#https?:\/\/.*$/, "");
    if (!seen.has(clean)) {
      seen.add(clean);
      images.push(clean);
    }
  }
  return images;
}

// ── auth ─────────────────────────────────────────────────────────────

async function login(): Promise<void> {
  const email = process.env.LISTSERV_EMAIL || "";
  const password = process.env.LISTSERV_PASSWORD || "";
  if (!email || !password) throw new Error("LISTSERV credentials required");

  const body = new URLSearchParams({ LOGIN1: "", Y: email, p: password, e: "Log In", X: "" });
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TigerMap/1.0" },
    body: body.toString(),
    redirect: "manual",
  });

  const html = await resp.text();
  const setCookie = resp.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/WALOGIN=([^;]+)/);
  const xMatch = html.match(/X=([A-F0-9]{16,})/);
  if (!cookieMatch || !xMatch) throw new Error("LISTSERV login failed");

  cookie = `WALOGIN=${cookieMatch[1]}`;
  authParams = `X=${xMatch[1]}&Y=${encodeURIComponent(email)}`;
}

function withAuth(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${authParams}`;
}

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { Cookie: cookie, "User-Agent": "TigerMap/1.0" } });
  return await resp.text();
}

/**
 * Fetch a message's complete body from its LISTSERV page. The RSS feed
 * truncates bodies (they end in "[...]"), so we follow the page's text/html
 * attachment link for the full email and collect its images plus any image
 * attachments. Ported from TheForum's fetch_full_message().
 * Returns null when the page has no body attachment to fetch.
 */
async function fetchFullMessage(
  messageUrl: string,
): Promise<{ bodyHtml: string; images: string[] } | null> {
  if (!cookie || !authParams) await login();
  let page = await fetchText(withAuth(messageUrl));
  if (page.includes("Login Required")) {
    await login();
    page = await fetchText(withAuth(messageUrl));
    if (page.includes("Login Required")) throw new Error("LISTSERV login required");
  }

  const attachments = [...page.matchAll(/href="(\/cgi-bin\/wa\?A3=[^"]+)"[^>]*>([^<]+)<\/a>/g)].map(
    ([, link, label]) => ({
      url: `https://lists.princeton.edu${link.replace("&header=1", "")}`,
      label: label.trim().toLowerCase(),
    }),
  );
  const body =
    attachments.find((a) => a.label.includes("text/html")) ??
    attachments.find((a) => a.label.includes("text/plain"));
  if (!body) return null;

  const bodyHtml = await fetchText(withAuth(body.url));
  if (bodyHtml.includes("Login Required")) throw new Error("LISTSERV login required");

  const images = extractImages(bodyHtml);
  for (const att of attachments) {
    const isImage =
      att.label.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i.test(att.label);
    if (isImage && !images.includes(att.url)) images.push(att.url);
  }
  return { bodyHtml, images };
}

// ── database ─────────────────────────────────────────────────────────

export function initEatingClubDb(dataDir: string): Database {
  const dbPath = path.join(dataDir, "eatingclubs.sqlite");
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS eating_club_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id     TEXT UNIQUE NOT NULL,
      subject        TEXT NOT NULL,
      author_name    TEXT,
      author_email   TEXT,
      date           TEXT,
      body_html      TEXT,
      body_text      TEXT,
      images         TEXT DEFAULT '[]',
      listserv_url   TEXT,
      club_name      TEXT,
      club_lat       REAL,
      club_lng       REAL,
      event_type     TEXT,
      classified_at  TEXT DEFAULT (datetime('now')),
      created_at     TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_ec_date ON eating_club_events(date DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_ec_club ON eating_club_events(club_name)");

  // Every WHITMANWIRE email the classifier has ruled on, so it's never re-sent
  db.run(`
    CREATE TABLE IF NOT EXISTS seen_messages (
      message_id  TEXT PRIMARY KEY,
      subject     TEXT,
      date        TEXT,
      verdict     TEXT NOT NULL,
      checked_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: track whether the full body has been fetched from LISTSERV.
  // Rows imported from TheForum's export already carry full bodies + images.
  const cols = db.prepare("PRAGMA table_info(eating_club_events)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "body_complete")) {
    db.run("ALTER TABLE eating_club_events ADD COLUMN body_complete INTEGER DEFAULT 0");
    db.run(
      `UPDATE eating_club_events SET body_complete = 1
       WHERE body_text NOT LIKE '%[...]' AND images != '[]'`,
    );
  }

  return db;
}

// ── RSS scraping (ongoing) ───────────────────────────────────────────

interface RawEmail {
  message_id: string;
  subject: string;
  author_name: string;
  author_email: string;
  date: string;
  body_html: string;
  body_text: string;
  images: string[];
  listserv_url: string;
}

async function fetchWhitmanwireRss(limit = 200): Promise<RawEmail[]> {
  const url = `${BASE_URL}?RSS&L=WHITMANWIRE&v=2.0&LIMIT=${limit}&${authParams}`;
  const resp = await fetch(url, {
    headers: { Cookie: cookie, "User-Agent": "TigerMap/1.0" },
  });
  const data = await resp.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
    processEntities: false,
    htmlEntities: true,
  });
  const parsed = parser.parse(data);

  let items = parsed?.rss?.channel?.item || parsed?.["rdf:RDF"]?.item || [];
  if (!Array.isArray(items)) items = items ? [items] : [];

  return items.map((item: any) => {
    const authorRaw = item.author || "";
    const authorMatch =
      authorRaw.match(/(.+?)\s*<(.+?)>/) || authorRaw.match(/(.+?)\s*&lt;(.+?)&gt;/);
    const link = item.link || "";
    const msgIdMatch = link.match?.(/A2=([^&]+)/);
    const description = item.description || "";

    return {
      message_id: msgIdMatch ? msgIdMatch[1] : "",
      subject: item.title || "",
      author_name: authorMatch ? authorMatch[1].trim() : authorRaw,
      author_email: authorMatch ? authorMatch[2].trim() : "",
      date: (() => {
        try {
          const d = new Date(item.pubDate || "");
          return Number.isNaN(d.getTime()) ? item.pubDate : d.toISOString();
        } catch {
          return item.pubDate || "";
        }
      })(),
      body_html: description,
      body_text: stripHtml(description),
      images: [],
      listserv_url: link,
    };
  });
}

// ── classification + storage ─────────────────────────────────────────

async function classifyAndStore(
  db: Database,
  emails: RawEmail[],
): Promise<{ processed: number; stored: number }> {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO eating_club_events (
      message_id, subject, author_name, author_email, date,
      body_html, body_text, images, listserv_url,
      club_name, club_lat, club_lng, event_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markSeen = db.prepare(
    "INSERT OR REPLACE INTO seen_messages (message_id, subject, date, verdict) VALUES (?, ?, ?, ?)",
  );
  const alreadyHandled = db.prepare(
    `SELECT 1 FROM eating_club_events WHERE message_id = ?
     UNION SELECT 1 FROM seen_messages WHERE message_id = ?`,
  );

  // Every email is classified by the LLM exactly once. A keyword gate used to
  // run first, but it dropped real events that only named a club by its
  // street address or nickname.
  const pending = emails.filter(
    (e) => e.message_id && !alreadyHandled.get(e.message_id, e.message_id),
  );
  if (pending.length === 0) return { processed: 0, stored: 0 };

  let stored = 0;
  let consecutiveFailures = 0;
  for (const email of pending) {
    const result = await classifyEmail(email.subject, email.body_text);
    if (!result) {
      // API failure — leave it unrecorded so the next cycle retries, and stop
      // hammering a failing API
      if (++consecutiveFailures >= 3) {
        console.error("[eatingclubs] LLM API failing repeatedly — aborting this pass");
        break;
      }
      continue;
    }
    consecutiveFailures = 0;

    const club =
      result.isEatingClubEvent && result.clubName
        ? EATING_CLUBS.find((c) => c.name === result.clubName)
        : undefined;
    if (club) {
      stmt.run(
        email.message_id,
        email.subject,
        email.author_name,
        email.author_email,
        email.date,
        email.body_html,
        email.body_text,
        JSON.stringify(email.images),
        email.listserv_url,
        club.name,
        club.lat,
        club.lng,
        result.eventType,
      );
      stored++;
      markSeen.run(email.message_id, email.subject, email.date, "event");
    } else {
      markSeen.run(email.message_id, email.subject, email.date, "not_event");
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return { processed: pending.length, stored };
}

// ── JSON import (bulk, from TheForum) ────────────────────────────────

export async function importFromJson(
  db: Database,
  jsonPath: string,
  monthsBack = 9,
): Promise<{ total: number; candidates: number; stored: number }> {
  console.log(`[eatingclubs] Importing from ${jsonPath}...`);

  const file = await Bun.file(jsonPath).text();
  const data = JSON.parse(file);
  const messages: any[] = data.messages || [];

  // Filter to last N months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffIso = cutoff.toISOString();

  const recent = messages.filter((m: any) => m.date >= cutoffIso);
  console.log(
    `[eatingclubs] ${recent.length} emails in last ${monthsBack} months (of ${messages.length} total)`,
  );

  const emails: RawEmail[] = recent.map((m: any) => ({
    message_id: m.message_id || "",
    subject: m.subject || "",
    author_name: m.author_name || "",
    author_email: m.author_email || "",
    date: m.date || "",
    body_html: m.body_html || "",
    body_text: m.body_text || stripHtml(m.body_html || ""),
    images: m.images || [],
    listserv_url: m.listserv_url || "",
  }));

  const { processed, stored } = await classifyAndStore(db, emails);
  console.log(
    `[eatingclubs] Import done: ${processed} candidates → ${stored} eating club events stored`,
  );

  return { total: recent.length, candidates: processed, stored };
}

// ── full-body enrichment ─────────────────────────────────────────────

/**
 * Replace RSS-truncated bodies with the complete email from LISTSERV and
 * pick up images. Runs after every scrape; safe to call repeatedly.
 */
export async function enrichFullMessages(
  db: Database,
): Promise<{ enriched: number; pending: number }> {
  const rows = db
    .prepare(
      `SELECT id, listserv_url FROM eating_club_events
       WHERE body_complete = 0 AND listserv_url != ''
       ORDER BY date DESC
       LIMIT 100`,
    )
    .all() as { id: number; listserv_url: string }[];
  if (rows.length === 0) return { enriched: 0, pending: 0 };

  console.log(`[eatingclubs] Fetching full bodies for ${rows.length} emails...`);
  const update = db.prepare(
    `UPDATE eating_club_events
     SET body_html = ?, body_text = ?, images = ?, body_complete = 1
     WHERE id = ?`,
  );
  const giveUp = db.prepare("UPDATE eating_club_events SET body_complete = 1 WHERE id = ?");

  let enriched = 0;
  for (const row of rows) {
    try {
      const full = await fetchFullMessage(row.listserv_url);
      if (full) {
        update.run(full.bodyHtml, stripHtml(full.bodyHtml), JSON.stringify(full.images), row.id);
        enriched++;
      } else {
        // No body attachment on the page — nothing more to fetch, stop retrying
        giveUp.run(row.id);
      }
    } catch (err: any) {
      console.error(`[eatingclubs] Full-body fetch failed for #${row.id}: ${err.message}`);
    }
    // Be gentle with the LISTSERV server
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[eatingclubs] Enriched ${enriched}/${rows.length} emails`);
  return { enriched, pending: rows.length - enriched };
}

// ── public API ───────────────────────────────────────────────────────

export async function scrapeWhitmanwire(
  db: Database,
  limit = 200,
): Promise<{ total: number; stored: number }> {
  await login();
  const emails = await fetchWhitmanwireRss(limit);
  const { stored } = await classifyAndStore(db, emails);

  // Fill in complete bodies + images for anything still truncated (background)
  enrichFullMessages(db).catch((err) =>
    console.error("[eatingclubs] Full-body enrichment failed:", err.message),
  );

  return { total: emails.length, stored };
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startEatingClubScraper(db: Database, intervalMs = 30 * 60 * 1000): void {
  const run = () =>
    scrapeWhitmanwire(db)
      .then(({ total, stored }) => {
        if (stored > 0)
          console.log(`[eatingclubs] Scraped: ${stored} new events / ${total} from RSS`);
      })
      .catch((err) => console.error("[eatingclubs] Scrape failed:", err.message));

  run();
  intervalId = setInterval(run, intervalMs);
  console.log(`[eatingclubs] Auto-scraper started (interval: ${Math.round(intervalMs / 60000)}m)`);
}

export function stopEatingClubScraper(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
