/**
 * Fastify routes for Princeton dining menus.
 */

import type { FastifyInstance } from "fastify";
import {
  DINING_HALLS,
  currentMeal,
  getTodayMenus,
  scrapeAllMenus,
  scrapeHallMenu,
} from "./scraper.js";

export async function diningRoutes(app: FastifyInstance) {
  // List all dining halls with coordinates
  app.get("/api/dining/halls", async () => {
    return { halls: DINING_HALLS };
  });

  // Today's menus for all halls (cached)
  app.get("/api/dining/today", async () => {
    const menus = await getTodayMenus();
    return { currentMeal: currentMeal(), menus };
  });

  // Menus for a specific date
  app.get<{ Querystring: { date?: string } }>("/api/dining/menus", async (request) => {
    const dateStr = request.query.date;
    const date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) return { error: "Invalid date" };
    const menus = await scrapeAllMenus(date);
    return { date: dateStr || "today", menus };
  });

  // Menu for a single hall (by ID or name)
  app.get<{ Params: { hallId: string }; Querystring: { date?: string } }>(
    "/api/dining/hall/:hallId",
    async (request) => {
      const { hallId } = request.params;
      const hall = DINING_HALLS.find(
        (h) => h.id === hallId || h.name.toLowerCase().includes(hallId.toLowerCase()),
      );
      if (!hall) return { error: "Hall not found" };

      const dateStr = request.query.date;
      const date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
      const menu = await scrapeHallMenu(hall, date);
      return { currentMeal: currentMeal(), menu };
    },
  );
}
