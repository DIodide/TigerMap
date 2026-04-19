/**
 * Fastify routes for the FREEFOOD live feed.
 */

import type { Database } from "bun:sqlite";
import type { FastifyInstance } from "fastify";
import { matchLocations } from "./locations.js";
import { fetchAuthenticatedImage, scrapeFreefood } from "./scraper.js";

export function freefoodRoutes(freefoodDb: Database) {
  return async function (app: FastifyInstance) {
    // ── Map feed: emails with LLM-matched coordinates ────────────
    app.get<{ Querystring: { hours?: string } }>("/api/freefood/feed", async (request) => {
      const hours = Math.min(Number(request.query.hours) || 12, 720);
      const rows = freefoodDb
        .prepare(
          `SELECT id, message_id, subject, author_name, author_email,
                  date, body_html, body_text, links, images, is_hoagiemail,
                  hoagiemail_sender_name, hoagiemail_sender_email,
                  listserv_url, location_name, location_lat as lat, location_lng as lng,
                  created_at
           FROM freefood_emails
           WHERE location_lat IS NOT NULL
             AND location_name != 'UNKNOWN'
             AND date > datetime('now', '-' || ? || ' hours')
           ORDER BY date DESC`,
        )
        .all(hours);
      return { emails: rows };
    });

    // ── Latest freefood posts (newest first) ─────────────────────
    app.get<{ Querystring: { limit?: string; offset?: string } }>(
      "/api/freefood",
      async (request) => {
        const limit = Math.min(Number(request.query.limit) || 50, 200);
        const offset = Number(request.query.offset) || 0;
        const rows = freefoodDb
          .prepare(
            `SELECT id, message_id, subject, author_name, author_email,
                    date, body_text, links, images, is_hoagiemail,
                    hoagiemail_sender_name, hoagiemail_sender_email,
                    listserv_url, location_name, created_at
             FROM freefood_emails
             ORDER BY date DESC
             LIMIT ? OFFSET ?`,
          )
          .all(limit, offset);
        const total = (
          freefoodDb.prepare("SELECT COUNT(*) as count FROM freefood_emails").get() as any
        ).count;
        return { total, limit, offset, emails: rows };
      },
    );

    // Search freefood posts
    app.get<{ Querystring: { q: string } }>("/api/freefood/search", async (request) => {
      const { q } = request.query;
      if (!q || q.length < 2) return { emails: [] };
      const pattern = `%${q}%`;
      const rows = freefoodDb
        .prepare(
          `SELECT id, message_id, subject, author_name, author_email,
                  date, body_text, links, images, is_hoagiemail,
                  hoagiemail_sender_name, hoagiemail_sender_email,
                  listserv_url, location_name, created_at
           FROM freefood_emails
           WHERE subject LIKE ? OR body_text LIKE ? OR author_name LIKE ?
           ORDER BY date DESC
           LIMIT 50`,
        )
        .all(pattern, pattern, pattern);
      return { emails: rows };
    });

    // Get single post by ID
    app.get<{ Params: { id: string } }>("/api/freefood/:id", async (request) => {
      const row = freefoodDb
        .prepare("SELECT * FROM freefood_emails WHERE id = ?")
        .get(request.params.id);
      if (!row) return { error: "Not found" };
      return row;
    });

    // Manually trigger a scrape (accepts ?limit= for backfill, max 5000)
    app.post<{ Querystring: { limit?: string } }>("/api/freefood/scrape", async (request) => {
      const limit = Math.min(Number(request.query.limit) || 500, 5000);
      const result = await scrapeFreefood(freefoodDb, limit);
      return { ok: true, ...result };
    });

    // Reset UNKNOWN rows to NULL and re-run the LLM matcher against them.
    // Lets us pick up newly-added buildings or prompt improvements without
    // re-scraping the whole RSS feed.
    app.post("/api/freefood/rematch", async () => {
      const reset = freefoodDb
        .prepare("UPDATE freefood_emails SET location_name = NULL WHERE location_name = 'UNKNOWN'")
        .run();
      const matched = await matchLocations(freefoodDb);
      return { ok: true, reset: reset.changes, matched };
    });

    // Image proxy — fetches LISTSERV images with fresh auth
    app.get<{ Params: { emailId: string; index: string } }>(
      "/api/freefood/image/:emailId/:index",
      async (request, reply) => {
        const row = freefoodDb
          .prepare("SELECT images FROM freefood_emails WHERE id = ?")
          .get(request.params.emailId) as { images: string } | undefined;
        if (!row) return reply.code(404).send({ error: "Not found" });

        const images: string[] = JSON.parse(row.images || "[]");
        const idx = Number(request.params.index);
        if (idx < 0 || idx >= images.length) return reply.code(404).send({ error: "No such image" });

        const imageData = await fetchAuthenticatedImage(images[idx]);
        if (!imageData) return reply.code(502).send({ error: "Failed to fetch image" });

        // Guess content type from URL or default to jpeg
        const urlLower = images[idx].toLowerCase();
        const contentType = urlLower.includes("png")
          ? "image/png"
          : urlLower.includes("gif")
            ? "image/gif"
            : urlLower.includes("webp")
              ? "image/webp"
              : "image/jpeg";

        reply.header("Content-Type", contentType);
        reply.header("Cache-Control", "public, max-age=86400");
        return reply.send(Buffer.from(imageData));
      },
    );

    // Stats
    app.get("/api/freefood/stats", async () => {
      const total = (
        freefoodDb.prepare("SELECT COUNT(*) as count FROM freefood_emails").get() as any
      ).count;
      const located = (
        freefoodDb
          .prepare(
            "SELECT COUNT(*) as count FROM freefood_emails WHERE location_lat IS NOT NULL AND location_name != 'UNKNOWN'",
          )
          .get() as any
      ).count;
      const withImages = (
        freefoodDb
          .prepare("SELECT COUNT(*) as count FROM freefood_emails WHERE images != '[]'")
          .get() as any
      ).count;
      const newest = freefoodDb
        .prepare("SELECT date FROM freefood_emails ORDER BY date DESC LIMIT 1")
        .get() as any;
      const oldest = freefoodDb
        .prepare("SELECT date FROM freefood_emails ORDER BY date ASC LIMIT 1")
        .get() as any;
      return {
        total,
        located,
        with_images: withImages,
        newest_date: newest?.date ?? null,
        oldest_date: oldest?.date ?? null,
      };
    });
  };
}
