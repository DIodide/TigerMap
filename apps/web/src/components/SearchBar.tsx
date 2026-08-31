import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { POI } from "../types";
import { getCategoryColor } from "../utils/categories";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  results: POI[];
  onPick: (poi: POI) => void;
}

export function SearchBar({ value, onChange, results, onPick }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset highlight whenever the result set changes
  useEffect(() => setActiveIdx(0), [results]);

  const pick = (poi: POI) => {
    setOpen(false);
    inputRef.current?.blur();
    onPick(poi);
  };

  const showDropdown = open && value.trim().length >= 2 && results.length > 0;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search Campus Maps"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[activeIdx] ?? results[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="search-results"
        className="w-full pl-4 pr-10 py-2.5 rounded-lg bg-white border border-gray-300 shadow-md text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />

      {showDropdown && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {results.map((poi, i) => (
            <li key={poi.id} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                // mousedown fires before the input's blur closes the dropdown
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(poi);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left ${
                  i === activeIdx ? "bg-gray-100" : ""
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: getCategoryColor(poi.cat) }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{poi.name}</span>
                {poi.cat && <span className="shrink-0 text-xs text-gray-400">{poi.cat}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
