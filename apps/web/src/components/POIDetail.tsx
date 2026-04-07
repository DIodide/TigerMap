import { ExternalLink, MapPin, Phone, X } from "lucide-react";
import type { POI } from "../types";
import { getCategoryColor } from "../utils/categories";

interface POIDetailProps {
  poi: POI;
  onClose: () => void;
}

export function POIDetail({ poi, onClose }: POIDetailProps) {
  const color = getCategoryColor(poi.cat);

  return (
    <div className="detail-panel">
      {poi.img && (
        <div className="relative h-40 shrink-0">
          <img src={poi.img} alt={poi.name} className="w-full h-full object-cover" />
          <button type="button" onClick={onClose} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {!poi.img && (
          <div className="flex justify-end mb-2">
            <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        <h2 className="text-lg font-bold text-gray-900">{poi.name}</h2>
        {poi.sub && <p className="text-sm text-gray-500 mt-0.5">{poi.sub}</p>}
        {poi.cat && (
          <span className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mt-2" style={{ backgroundColor: `${color}15`, color }}>
            {poi.cat}
          </span>
        )}
        {poi.desc && <p className="text-sm text-gray-600 mt-3 leading-relaxed">{poi.desc}</p>}
        <div className="mt-4 space-y-2">
          {poi.hours && (
            <div className="flex items-start gap-2 text-sm">
              <span className="font-semibold text-gray-700 shrink-0">Hours:</span>
              <span className="text-gray-600">{poi.hours}</span>
            </div>
          )}
          {poi.addr && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={14} className="shrink-0 text-gray-400" />
              {poi.addr}
            </div>
          )}
          {poi.phone && (
            <a href={`tel:${poi.phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <Phone size={14} className="shrink-0" />
              {poi.phone}
            </a>
          )}
          {poi.web && (
            <a href={poi.web} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <ExternalLink size={14} className="shrink-0" />
              Visit website
            </a>
          )}
        </div>
        {poi.access === "true" && (
          <div className="mt-3 text-xs text-green-700 bg-green-50 px-2.5 py-1.5 rounded-md">Wheelchair Accessible</div>
        )}
      </div>
    </div>
  );
}
