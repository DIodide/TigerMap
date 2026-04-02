import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search Campus Maps"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-4 pr-10 py-2.5 rounded-lg bg-white border border-gray-300 shadow-md text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <Search
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}
