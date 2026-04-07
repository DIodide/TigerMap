import { X } from "lucide-react";
import type { DiningHallMenu } from "../types";

interface DiningDetailProps {
  menu: DiningHallMenu;
  currentMeal: string;
  onClose: () => void;
}

export function DiningDetail({ menu, currentMeal, onClose }: DiningDetailProps) {
  const sortedMeals = [...menu.meals].sort((a, b) => {
    if (a.meal === currentMeal) return -1;
    if (b.meal === currentMeal) return 1;
    return 0;
  });

  const isRetail = menu.hall.category === "retail";

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white shrink-0">
        <span className="text-lg">🍽</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold tracking-wide block truncate">{menu.hall.name}</span>
          <span className="text-xs text-white/80">{isRetail ? "Retail" : currentMeal}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {sortedMeals.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No menu available for today.</p>
        )}

        {sortedMeals.map((meal) => (
          <div key={meal.meal}>
            {!(isRetail && sortedMeals.length === 1) && (
              <div
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider border-b ${
                  meal.meal === currentMeal
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-gray-50 text-gray-500 border-gray-100"
                }`}
              >
                {meal.meal}
                {meal.meal === currentMeal && !isRetail && (
                  <span className="ml-1.5 text-[10px] font-medium normal-case">— now serving</span>
                )}
              </div>
            )}

            <div className="px-4 py-2 space-y-2.5">
              {Object.entries(meal.stations).map(([station, items]) => (
                <div key={station}>
                  <h4 className="text-xs font-semibold text-gray-800 mb-0.5">{station}</h4>
                  <ul className="space-y-0">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 leading-relaxed pl-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
