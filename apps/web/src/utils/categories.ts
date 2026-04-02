const CATEGORY_COLORS: Record<string, string> = {
  Building: "#4a7c59",
  University: "#4a7c59",
  "Academic Department": "#2563eb",
  "Administrative Department": "#6366f1",
  College: "#b91c1c",
  Dormitory: "#9333ea",
  Library: "#0891b2",
  "Dining Hall": "#ea580c",
  Cafe: "#d97706",
  Restaurant: "#dc2626",
  "Food Court": "#ea580c",
  "Convenience Store": "#65a30d",
  "Parking Lot": "#3b82f6",
  "Bus Stop": "#0ea5e9",
  "Train Station": "#0284c7",
  "Emergency Phone": "#dc2626",
  "Public Art": "#ec4899",
  "Events Venue": "#8b5cf6",
  Theater: "#a855f7",
  Gallery: "#d946ef",
  Museum: "#c026d3",
  "Sports Center": "#16a34a",
  "Fitness Center": "#22c55e",
  "Swimming Pool": "#06b6d4",
  Park: "#15803d",
  Entrance: "#64748b",
  Ramp: "#64748b",
  Steps: "#94a3b8",
  Information: "#0ea5e9",
  Shop: "#8b5cf6",
};

const CATEGORY_ICONS: Record<string, string> = {
  Building: "🏛",
  University: "🏛",
  "Academic Department": "📚",
  "Administrative Department": "🏢",
  College: "🛡",
  Dormitory: "🏠",
  Library: "📖",
  "Dining Hall": "🍽",
  Cafe: "☕",
  Restaurant: "🍴",
  "Parking Lot": "P",
  "Bus Stop": "🚌",
  "Train Station": "🚂",
  "Emergency Phone": "📞",
  "Public Art": "🎨",
  "Events Venue": "🎭",
  Theater: "🎭",
  Gallery: "🖼",
  Museum: "🏛",
  "Sports Center": "⚽",
  "Fitness Center": "💪",
  Park: "🌳",
  Entrance: "🚪",
  Information: "ℹ",
};

export function getCategoryColor(category: string | null | undefined): string {
  return CATEGORY_COLORS[category ?? ""] ?? "#64748b";
}

export function getCategoryIcon(category: string | null | undefined): string {
  return CATEGORY_ICONS[category ?? ""] ?? "•";
}
