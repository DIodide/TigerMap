import { X } from "lucide-react";
import { getCategoryColor } from "../utils/categories";

interface CategorySidebarProps {
  categories: { name: string; count: number }[];
  activeCategories: Set<string>;
  onToggle: (name: string) => void;
  onClose: () => void;
}

const HIDDEN = new Set(["Steps", "steps", "Entrance", "Ramp"]);

export function CategorySidebar({ categories, activeCategories, onToggle, onClose }: CategorySidebarProps) {
  const display = categories.filter((c) => !HIDDEN.has(c.name));

  return (
    <div className="absolute top-12 left-4 z-20 w-[300px] max-h-[calc(100vh-80px)] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Categories</h2>
        <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {display.map(({ name, count }) => {
          const isActive = activeCategories.has(name);
          const color = getCategoryColor(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onToggle(name)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${isActive ? "bg-gray-100" : "hover:bg-gray-50"}`}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: isActive ? color : "#d1d5db" }} />
              <span className="text-xs font-medium text-gray-700 flex-1">{name}</span>
              <span className="text-[10px] text-gray-400 font-mono">{count}</span>
            </button>
          );
        })}
      </div>
      {activeCategories.size > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <button type="button" onClick={() => { for (const n of activeCategories) onToggle(n); }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
