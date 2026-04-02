/**
 * Eating club events API routes.
 */

import type { Database } from "bun:sqlite";
import type { FastifyInstance } from "fastify";
import { EATING_CLUBS } from "./classifier.js";
import { importFromJson, scrapeWhitmanwire } from "./scraper.js";

export function registerEatingClubRoutes(app: FastifyInstance, db: Database) {
  /** GET /api/eating-clubs — list all clubs with their latest events */
  app.get("/api/eating-clubs", (_req, reply) => {
    const clubs = EATING_CLUBS.map((club) => {
      const events = db
        .prepare(
          `SELECT id, subject, author_name, date, event_type, body_text
           FROM eating_club_events
           WHERE club_name = ?
           ORDER BY date DESC
           LIMIT 5`,
        )
        .all(club.name) as any[];

      return {
        name: club.name,
        lat: club.lat,
        lng: club.lng,
        sprite: club.sprite,
        eventCount: events.length,
        recentEvents: events.map((e) => ({
          id: e.id,
          subject: e.subject,
          author: e.author_name,
          date: e.date,
          type: e.event_type,
          preview: (e.body_text || "").split("-----")[0].trim().slice(0, 150),
        })),
      };
    });

    reply.send({ clubs });
  });

  /** GET /api/eating-clubs/:clubName/events — events for a specific club */
  app.get("/api/eating-clubs/:clubName/events", (req, reply) => {
    const { clubName } = req.params as { clubName: string };
    const { limit = "20", offset = "0" } = req.query as Record<string, string>;

    const rows = db
      .prepare(
        `SELECT id, message_id, subject, author_name, author_email, date,
                body_text, images, listserv_url, event_type
         FROM eating_club_events
         WHERE club_name = ?
         ORDER BY date DESC
         LIMIT ? OFFSET ?`,
      )
      .all(clubName, Math.min(Number(limit) || 20, 50), Number(offset) || 0);

    reply.send({ club: clubName, events: rows });
  });

  /** GET /api/eating-clubs/events/recent — all recent events across clubs */
  app.get("/api/eating-clubs/events/recent", (req, reply) => {
    const { days = "30" } = req.query as Record<string, string>;
    const d = Math.min(Number(days) || 30, 270);

    const rows = db
      .prepare(
        `SELECT id, subject, author_name, date, club_name, event_type,
                SUBSTR(body_text, 1, 200) as preview
         FROM eating_club_events
         WHERE date > datetime('now', '-' || ? || ' days')
         ORDER BY date DESC
         LIMIT 100`,
      )
      .all(d);

    reply.send({ events: rows });
  });

  /** GET /api/eating-clubs/stats */
  app.get("/api/eating-clubs/stats", (_req, reply) => {
    const stats = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           COUNT(DISTINCT club_name) as clubs_with_events,
           MIN(date) as oldest,
           MAX(date) as newest
         FROM eating_club_events`,
      )
      .get() as any;

    const byClub = db
      .prepare(
        `SELECT club_name, COUNT(*) as count
         FROM eating_club_events
         GROUP BY club_name
         ORDER BY count DESC`,
      )
      .all();

    reply.send({ ...stats, byClub });
  });

  /** POST /api/eating-clubs/scrape — manual scrape trigger */
  app.post("/api/eating-clubs/scrape", async (_req, reply) => {
    try {
      const result = await scrapeWhitmanwire(db);
      reply.send({ ok: true, ...result });
    } catch (err: any) {
      reply.status(500).send({ ok: false, error: err.message });
    }
  });

  /** POST /api/eating-clubs/import — import from TheForum JSON */
  app.post("/api/eating-clubs/import", async (req, reply) => {
    const { path: jsonPath, months = 9 } = req.body as { path?: string; months?: number };
    if (!jsonPath) {
      return reply.status(400).send({ error: "path is required" });
    }

    try {
      const result = await importFromJson(db, jsonPath, months);
      reply.send({ ok: true, ...result });
    } catch (err: any) {
      reply.status(500).send({ ok: false, error: err.message });
    }
  });
}
