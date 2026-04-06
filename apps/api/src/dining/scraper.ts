/**
 * Princeton Dining Menu scraper.
 *
 * Scrapes menus.princeton.edu/dining/_Foodpro/ for dining hall menus.
 * No API key required — public FoodPro pages.
 */

const BASE_URL = "https://menus.princeton.edu/dining/_Foodpro/online-menu";

export interface DiningHall {
  id: string;
  name: string;
  category: "residential" | "retail";
  lat: number;
  lng: number;
}

export interface MenuItem {
  name: string;
  station: string;
}

export interface MealMenu {
  meal: string;
  stations: Record<string, string[]>;
}

export interface HallMenu {
  hall: DiningHall;
  date: string;
  meals: MealMenu[];
}

/** All known dining halls with map coordinates. */
export const DINING_HALLS: DiningHall[] = [
  // Residential
  { id: "01", name: "Mathey & Rockefeller", category: "residential", lat: 40.3481, lng: -74.6622 },
  { id: "03", name: "Forbes College", category: "residential", lat: 40.3422, lng: -74.6612 },
  { id: "04", name: "Graduate College", category: "residential", lat: 40.3408, lng: -74.6654 },
  { id: "05", name: "Center for Jewish Life", category: "residential", lat: 40.3467, lng: -74.6536 },
  { id: "06", name: "Yeh College & NCW", category: "residential", lat: 40.3422, lng: -74.6540 },
  { id: "08", name: "Whitman & Butler", category: "residential", lat: 40.3442, lng: -74.6576 },
  // Retail
  { id: "15", name: "Frist Gallery", category: "retail", lat: 40.3467, lng: -74.6551 },
  { id: "16", name: "Witherspoon's", category: "retail", lat: 40.3476, lng: -74.6582 },
  { id: "23", name: "Chemistry Café", category: "retail", lat: 40.3460, lng: -74.6510 },
  { id: "24", name: "EQuad Café", category: "retail", lat: 40.3505, lng: -74.6514 },
  { id: "26", name: "Genomics Café", category: "retail", lat: 40.3451, lng: -74.6502 },
  { id: "07", name: "Schultz Café", category: "retail", lat: 40.3448, lng: -74.6510 },
  { id: "12", name: "Tiger Tea Room", category: "retail", lat: 40.3495, lng: -74.6573 },
];

// ── HTML parsing helpers (no BeautifulSoup — just regex on the HTML) ──

function fetchPage(url: string, retries = 3): Promise<string> {
  return (async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "TigerMap-DiningScraper/1.0" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.text();
      } catch (e) {
        if (attempt === retries - 1) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw new Error("unreachable");
  })();
}

function buildMenuUrl(date: Date, locationId: string): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  return `${BASE_URL}/menuDetails.asp?myaction=read&dtdate=${m}/${d}/${y}&locationNum=${locationId}`;
}

/**
 * Parse the FoodPro menu page HTML into structured meal data.
 *
 * The HTML structure is:
 *   .card.mealCard > .card-header (meal name) + .card-body
 *     .mealStation (station name)
 *     .accordion-item > .title (item name)
 */
function parseMenuHtml(html: string): MealMenu[] {
  const meals: MealMenu[] = [];

  // Split by mealCard boundaries
  const cardRegex = /class="card mealCard"([\s\S]*?)(?=class="card mealCard"|$)/g;
  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const cardHtml = cardMatch[1];

    // Extract meal name from card-header
    const headerMatch = cardHtml.match(/card-header[^>]*>\s*([^<\n]+)/);
    if (!headerMatch) continue;
    const meal = headerMatch[1].trim();

    // Extract stations and their items
    const stations: Record<string, string[]> = {};
    let currentStation = "";

    // Match station divs and accordion items in order
    const elementRegex =
      /class="mealStation[^"]*"[^>]*>([\s\S]*?)<\/div>|class="title"[^>]*>([^<]+)/g;
    let elMatch: RegExpExecArray | null;

    while ((elMatch = elementRegex.exec(cardHtml)) !== null) {
      if (elMatch[1] !== undefined) {
        // Station name
        currentStation = elMatch[1].replace(/<[^>]+>/g, "").trim();
        if (currentStation && !stations[currentStation]) {
          stations[currentStation] = [];
        }
      } else if (elMatch[2] !== undefined && currentStation) {
        // Menu item
        const itemName = elMatch[2].trim();
        if (itemName) {
          stations[currentStation].push(itemName);
        }
      }
    }

    if (Object.keys(stations).length > 0) {
      meals.push({ meal, stations });
    }
  }

  return meals;
}

// ── Public API ───────────────────────────────────────────────────────

/** Scrape the menu for a single dining hall on a given date. */
export async function scrapeHallMenu(hall: DiningHall, date: Date): Promise<HallMenu> {
  const url = buildMenuUrl(date, hall.id);
  const html = await fetchPage(url);
  const meals = parseMenuHtml(html);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { hall, date: dateStr, meals };
}

/** Scrape menus for all dining halls on a given date. */
export async function scrapeAllMenus(date: Date): Promise<HallMenu[]> {
  const results = await Promise.allSettled(
    DINING_HALLS.map((hall) => scrapeHallMenu(hall, date)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<HallMenu> => r.status === "fulfilled")
    .map((r) => r.value);
}

/** Determine the current meal based on time of day (ET). */
export function currentMeal(): "Breakfast" | "Lunch" | "Dinner" {
  // Convert to ET
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = now.getHours();
  if (hour < 11) return "Breakfast";
  if (hour < 14) return "Lunch";
  return "Dinner";
}

// ── In-memory cache ──────────────────────────────────────────────────

interface MenuCache {
  date: string;
  menus: HallMenu[];
  fetchedAt: number;
}

let cache: MenuCache | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/** Get today's menus, using cache when fresh. */
export async function getTodayMenus(): Promise<HallMenu[]> {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (cache && cache.date === dateStr && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.menus;
  }

  console.log("[dining] Scraping menus for", dateStr);
  const menus = await scrapeAllMenus(today);
  cache = { date: dateStr, menus, fetchedAt: Date.now() };
  console.log(`[dining] Cached ${menus.length} hall menus`);
  return menus;
}
