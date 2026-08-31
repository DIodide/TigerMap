import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusMap } from "./components/CampusMap";
import { CategorySidebar } from "./components/CategorySidebar";
import { DiningDetail } from "./components/DiningDetail";
import { DirectionsSheet, type DirectionsState } from "./components/DirectionsSheet";
import { EatingClubDetail } from "./components/EatingClubDetail";
import { FreefoodDetail } from "./components/FreefoodDetail";
import { POIDetail } from "./components/POIDetail";
import { SearchBar } from "./components/SearchBar";
import type { DiningHallMenu, EatingClub, FreefoodPost, POI } from "./types";
import { type TravelProfile, fetchRoutes } from "./utils/directions";

type DetailPanel =
  | { kind: "poi"; data: POI }
  | { kind: "freefood"; data: FreefoodPost }
  | { kind: "club"; data: EatingClub }
  | { kind: "dining"; data: DiningHallMenu }
  | null;

type Destination = DirectionsState["dest"];

// Map furniture that shouldn't appear as search destinations
const EXCLUDED_SEARCH_CATS = new Set(["Steps", "steps", "Ramp", "Entrance"]);

export function App() {
  const [pois, setPois] = useState<POI[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(["Restaurant"]));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [freefoodPosts, setFreefoodPosts] = useState<FreefoodPost[]>([]);
  const [eatingClubs, setEatingClubs] = useState<EatingClub[]>([]);
  const [diningMenus, setDiningMenus] = useState<DiningHallMenu[]>([]);
  const [diningCurrentMeal, setDiningCurrentMeal] = useState("Lunch");

  // Single active detail panel — only one can be open at a time
  const [detail, setDetail] = useState<DetailPanel>(null);

  const selectPOI = useCallback((poi: POI | null) => {
    setDetail(poi ? { kind: "poi", data: poi } : null);
  }, []);
  const selectFreefood = useCallback((post: FreefoodPost | null) => {
    setDetail(post ? { kind: "freefood", data: post } : null);
  }, []);
  const selectClub = useCallback((club: EatingClub | null) => {
    setDetail(club ? { kind: "club", data: club } : null);
  }, []);
  const selectDining = useCallback((menu: DiningHallMenu | null) => {
    setDetail(menu ? { kind: "dining", data: menu } : null);
  }, []);
  const closeDetail = useCallback(() => setDetail(null), []);

  // ── Directions ────────────────────────────────────────────────
  const [directions, setDirections] = useState<DirectionsState | null>(null);
  const lastProfile = useRef<TravelProfile>("walking");

  const startDirections = useCallback((dest: Destination) => {
    setDetail(null);
    setSidebarOpen(false);
    setDirections({
      dest,
      origin: null,
      routes: null,
      profile: lastProfile.current,
      status: "locating",
    });

    if (!navigator.geolocation) {
      setDirections((d) => (d?.dest === dest ? { ...d, status: "no-location" } : d));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDirections((d) => (d?.dest === dest ? { ...d, origin, status: "routing" } : d));
        fetchRoutes(origin, dest).then((routes) => {
          setDirections((d) => {
            if (d?.dest !== dest) return d;
            if (!routes.walking && !routes.cycling) return { ...d, status: "error" };
            const profile = routes[d.profile] ? d.profile : routes.walking ? "walking" : "cycling";
            return { ...d, routes, profile, status: "ready" };
          });
        });
      },
      () => setDirections((d) => (d?.dest === dest ? { ...d, status: "no-location" } : d)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  const selectProfile = useCallback((profile: TravelProfile) => {
    lastProfile.current = profile;
    setDirections((d) => (d ? { ...d, profile } : d));
  }, []);

  const retryDirections = useCallback(() => {
    if (directions) startDirections(directions.dest);
  }, [directions, startDirections]);

  const closeDirections = useCallback(() => {
    setDirections(null);
    setSearchQuery("");
  }, []);

  const pickSearchResult = useCallback(
    (poi: POI) => {
      setSearchQuery(poi.name);
      startDirections({ name: poi.name, lat: poi.lat, lng: poi.lng, cat: poi.cat });
    },
    [startDirections],
  );

  const directionsFromPOI = useCallback(
    (poi: POI) => startDirections({ name: poi.name, lat: poi.lat, lng: poi.lng, cat: poi.cat }),
    [startDirections],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const scored: { poi: POI; score: number }[] = [];
    for (const poi of pois) {
      if (!poi.name || EXCLUDED_SEARCH_CATS.has(poi.cat || "")) continue;
      const name = poi.name.toLowerCase();
      let score = -1;
      if (name.startsWith(q)) score = 0;
      else if (name.includes(q)) score = 1;
      else if (poi.alt?.toLowerCase().includes(q)) score = 2;
      else if (poi.cat?.toLowerCase().startsWith(q)) score = 3;
      if (score >= 0) scored.push({ poi, score });
    }
    scored.sort((a, b) => a.score - b.score || a.poi.name.length - b.poi.name.length);
    return scored.slice(0, 7).map((s) => s.poi);
  }, [pois, searchQuery]);

  useEffect(() => {
    fetch("/data/pois.json")
      .then((r) => r.json())
      .then((data: POI[]) => setPois(data));
  }, []);

  useEffect(() => {
    fetch("/api/eating-clubs")
      .then((r) => r.json())
      .then((data) => setEatingClubs(data.clubs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/dining/today")
      .then((r) => r.json())
      .then((data) => {
        setDiningMenus(data.menus ?? []);
        setDiningCurrentMeal(data.currentMeal ?? "Lunch");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/freefood/feed?hours=9")
        .then((r) => r.json())
        .then((data) => setFreefoodPosts(data.emails ?? []))
        .catch(() => {});
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const poi of pois) {
      const cat = poi.cat || "Other";
      cats.set(cat, (cats.get(cat) ?? 0) + 1);
    }
    return Array.from(cats.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [pois]);

  const filteredPOIs = useMemo(() => {
    if (activeCategories.size === 0 && !searchQuery.trim()) return [];
    let result = pois;
    if (activeCategories.size > 0) {
      result = result.filter((p) => activeCategories.has(p.cat || "Other"));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.alt?.toLowerCase().includes(q) ||
          p.desc?.toLowerCase().includes(q) ||
          p.cat?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [pois, activeCategories, searchQuery]);

  const toggleCategory = useCallback((name: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CampusMap
        pois={filteredPOIs}
        selectedPOI={detail?.kind === "poi" ? detail.data : null}
        onSelectPOI={selectPOI}
        freefoodPosts={freefoodPosts}
        selectedFreefood={detail?.kind === "freefood" ? detail.data : null}
        onSelectFreefood={selectFreefood}
        eatingClubs={eatingClubs}
        selectedClub={detail?.kind === "club" ? detail.data : null}
        onSelectClub={selectClub}
        diningMenus={diningMenus}
        selectedDining={detail?.kind === "dining" ? detail.data : null}
        onSelectDining={selectDining}
        route={
          directions?.status === "ready" ? (directions.routes?.[directions.profile] ?? null) : null
        }
        routeOrigin={directions?.origin ?? null}
        routeDest={directions?.dest ?? null}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="bg-[#2b2b2b] text-white px-6 py-2.5 flex items-center justify-center">
          <span className="text-sm font-semibold tracking-wider">&#9764; PRINCETON UNIVERSITY</span>
        </div>
      </div>

      {/* Search + categories */}
      <div className="absolute top-12 left-4 z-10 flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          results={searchResults}
          onPick={pickSearchResult}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="px-4 py-1.5 rounded-md bg-[#2b2b2b] text-white text-xs font-bold hover:bg-[#3b3b3b] transition-colors"
          >
            Categories
          </button>
        </div>
      </div>

      {sidebarOpen && (
        <CategorySidebar
          categories={categories}
          activeCategories={activeCategories}
          onToggle={toggleCategory}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Single detail panel — only one renders at a time */}
      {detail?.kind === "poi" && (
        <POIDetail poi={detail.data} onClose={closeDetail} onDirections={directionsFromPOI} />
      )}
      {detail?.kind === "freefood" && <FreefoodDetail post={detail.data} onClose={closeDetail} />}
      {detail?.kind === "club" && <EatingClubDetail club={detail.data} onClose={closeDetail} />}
      {detail?.kind === "dining" && (
        <DiningDetail menu={detail.data} currentMeal={diningCurrentMeal} onClose={closeDetail} />
      )}

      {directions && (
        <DirectionsSheet
          state={directions}
          onSelectProfile={selectProfile}
          onRetry={retryDirections}
          onClose={closeDirections}
        />
      )}
    </div>
  );
}
