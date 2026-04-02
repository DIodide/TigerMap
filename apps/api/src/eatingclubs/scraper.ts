/**
 * Eating club events scraper.
 *
 * Two modes:
 *  1. Import from TheForum's WHITMANWIRE JSON export (bulk, one-time)
 *  2. Ongoing RSS scraping from WHITMANWIRE listserv (same auth as FREEFOOD)
 *
 * Emails are pre-filtered by keywords, then classified by Gemini Flash Lite.
 * Only eating-club-related events are stored.
 */

import { Database } from "bun:sqlite";
import { XMLParser } from "fast-xml-parser";
import path from "node:path";
import { type ClassificationResult, EATING_CLUBS, classifyEmail, mightBeEatingClubEvent, resolveClub } from "./classifier.js";

const BASE_URL = "https://lists.princeton.edu/cgi-bin/wa";

// Re-use LISTSERV auth from the freefood scraper (same credentials)
let cookie = "";
let authParams = "";

// ── helpers ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let text = html
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<p[^>]*>/gi, "\n").replace(/<\/p>/gi, "");
  text = text.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n");
  return text.trim();
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

  const parser = new XMLParser({ ignoreAttributes: false, textNodeName: "_text", processEntities: false, htmlEntities: true });
  const parsed = parser.parse(data);

  let items = parsed?.rss?.channel?.item || parsed?.["rdf:RDF"]?.item || [];
  if (!Array.isArray(items)) items = items ? [items] : [];

  return items.map((item: any) => {
    const authorRaw = item.author || "";
    const authorMatch = authorRaw.match(/(.+?)\s*<(.+?)>/) || authorRaw.match(/(.+?)\s*&lt;(.+?)&gt;/);
    const link = item.link || "";
    const msgIdMatch = link.match?.(/A2=([^&]+)/);
    const description = item.description || "";

    return {
      message_id: msgIdMatch ? msgIdMatch[1] : "",
      subject: item.title || "",
      author_name: authorMatch ? authorMatch[1].trim() : authorRaw,
      author_email: authorMatch ? authorMatch[2].trim() : "",
      date: (() => { try { const d = new Date(item.pubDate || ""); return Number.isNaN(d.getTime()) ? item.pubDate : d.toISOString(); } catch { return item.pubDate || ""; } })(),
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
  // Pre-filter by keywords
  const candidates = emails.filter((e) => mightBeEatingClubEvent(e.subject, e.body_text));

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO eating_club_events (
      message_id, subject, author_name, author_email, date,
      body_html, body_text, images, listserv_url,
      club_name, club_lat, club_lng, event_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let stored = 0;
  for (const email of candidates) {
    // Skip if already in DB
    const exists = db.prepare("SELECT 1 FROM eating_club_events WHERE message_id = ?").get(email.message_id);
    if (exists) continue;

    const result = await classifyEmail(email.subject, email.body_text);
    if (!result || !result.isEatingClubEvent || !result.clubName) {
      await new Promise((r) => setTimeout(r, 80));
      continue;
    }

    const club = EATING_CLUBS.find((c) => c.name === result.clubName);
    if (!club) continue;

    stmt.run(
      email.message_id, email.subject, email.author_name, email.author_email,
      email.date, email.body_html, email.body_text, JSON.stringify(email.images),
      email.listserv_url, club.name, club.lat, club.lng, result.eventType,
    );
    stored++;
    await new Promise((r) => setTimeout(r, 80));
  }

  return { processed: candidates.length, stored };
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
  console.log(`[eatingclubs] ${recent.length} emails in last ${monthsBack} months (of ${messages.length} total)`);

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
  console.log(`[eatingclubs] Import done: ${processed} candidates → ${stored} eating club events stored`);

  return { total: recent.length, candidates: processed, stored };
}

// ── public API ───────────────────────────────────────────────────────

export async function scrapeWhitmanwire(
  db: Database,
  limit = 200,
): Promise<{ total: number; stored: number }> {
  await login();
  const emails = await fetchWhitmanwireRss(limit);
  const { stored } = await classifyAndStore(db, emails);
  return { total: emails.length, stored };
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startEatingClubScraper(db: Database, intervalMs = 30 * 60 * 1000): void {
  const run = () =>
    scrapeWhitmanwire(db)
      .then(({ total, stored }) => {
        if (stored > 0) console.log(`[eatingclubs] Scraped: ${stored} new events / ${total} from RSS`);
      })
      .catch((err) => console.error("[eatingclubs] Scrape failed:", err.message));

  run();
  intervalId = setInterval(run, intervalMs);
  console.log(`[eatingclubs] Auto-scraper started (interval: ${Math.round(intervalMs / 60000)}m)`);
}

export function stopEatingClubScraper(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
