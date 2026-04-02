import { useCallback, useEffect, useMemo, useState } from "react";
import { CampusMap } from "./components/CampusMap";
import { CategorySidebar } from "./components/CategorySidebar";
import { FreefoodDetail } from "./components/FreefoodDetail";
import { POIDetail } from "./components/POIDetail";
import { SearchBar } from "./components/SearchBar";
import type { FreefoodPost, POI } from "./types";

export function App() {
  const [pois, setPois] = useState<POI[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(["Restaurant"]));
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [freefoodPosts, setFreefoodPosts] = useState<FreefoodPost[]>([]);
  const [selectedFreefood, setSelectedFreefood] = useState<FreefoodPost | null>(null);

  useEffect(() => {
    fetch("/data/pois.json")
      .then((r) => r.json())
      .then((data: POI[]) => setPois(data));
  }, []);

  // Fetch free food feed on mount + every 2 minutes
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
    // No pins visible by default — user must search or select a category
    if (activeCategories.size === 0 && !searchQuery.trim()) {
      return [];
    }

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
        selectedPOI={selectedPOI}
        onSelectPOI={setSelectedPOI}
        freefoodPosts={freefoodPosts}
        selectedFreefood={selectedFreefood}
        onSelectFreefood={setSelectedFreefood}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="bg-[#2b2b2b] text-white px-6 py-2.5 flex items-center justify-center">
          <span className="text-sm font-semibold tracking-wider">&#9764; PRINCETON UNIVERSITY</span>
        </div>
      </div>

      {/* Search + categories */}
      <div className="absolute top-12 left-4 z-10 flex flex-col gap-2 w-[320px]">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
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

      {selectedPOI && <POIDetail poi={selectedPOI} onClose={() => setSelectedPOI(null)} />}
      {selectedFreefood && (
        <FreefoodDetail post={selectedFreefood} onClose={() => setSelectedFreefood(null)} />
      )}
    </div>
  );
}
