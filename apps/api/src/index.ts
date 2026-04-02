import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { registerEatingClubRoutes } from "./eatingclubs/routes.js";
import { initEatingClubDb, startEatingClubScraper } from "./eatingclubs/scraper.js";
import { freefoodRoutes } from "./freefood/routes.js";
import { initFreefoodDb, startAutoScraper } from "./freefood/scraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");

const app = Fastify({ logger: true });

// CORS for Vite dev server
await app.register(cors, { origin: true });

// Serve images from data/images
await app.register(fastifyStatic, {
  root: path.join(DATA_DIR, "images"),
  prefix: "/api/images/",
  decorateReply: false,
});

// Open SQLite databases
const db = new Database(path.join(DATA_DIR, "pois.sqlite"), { readonly: true });
const freefoodDb = initFreefoodDb(DATA_DIR);
const eatingClubDb = initEatingClubDb(DATA_DIR);

// Get all POIs
app.get("/api/pois", async () => {
  return db.prepare("SELECT * FROM poi_label ORDER BY name").all();
});

// Search POIs
app.get<{ Querystring: { q: string } }>("/api/pois/search", async (request) => {
  const { q } = request.query;
  if (!q || q.length < 2) return [];
  const pattern = `%${q}%`;
  return db
    .prepare(
      "SELECT * FROM poi_label WHERE name LIKE ? OR alt_name LIKE ? OR description LIKE ? ORDER BY rank ASC, name ASC LIMIT 50",
    )
    .all(pattern, pattern, pattern);
});

// Get POI by ID
app.get<{ Params: { id: string } }>("/api/pois/:id", async (request) => {
  const row = db.prepare("SELECT * FROM poi_label WHERE id = ?").get(request.params.id);
  if (!row) return { error: "Not found" };
  return row;
});

// Get POIs by category
app.get<{ Params: { category: string } }>("/api/pois/category/:category", async (request) => {
  return db
    .prepare("SELECT * FROM poi_label WHERE category_name = ? ORDER BY name")
    .all(request.params.category);
});

// Get all categories with counts
app.get("/api/categories", async () => {
  return db
    .prepare(
      "SELECT category_name, COUNT(*) as count FROM poi_label WHERE category_name IS NOT NULL GROUP BY category_name ORDER BY category_name",
    )
    .all();
});

// Register freefood routes
await app.register(freefoodRoutes(freefoodDb));

// Register eating club routes
registerEatingClubRoutes(app, eatingClubDb);

// Start server
const PORT = Number(process.env.PORT) || 3001;
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`TigerMap API running on http://localhost:${PORT}`);

  // Start auto-scraper (every 10 minutes) if credentials are configured
  if (process.env.LISTSERV_EMAIL && process.env.LISTSERV_PASSWORD) {
    startAutoScraper(freefoodDb);
    startEatingClubScraper(eatingClubDb); // every 30 min
  } else {
    console.log("[freefood] Skipping auto-scrapers (LISTSERV_EMAIL/LISTSERV_PASSWORD not set)");
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
