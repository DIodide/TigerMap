import { useCallback, useRef } from "react";
import { Map as MapGL, type MapRef, Marker, NavigationControl, Popup } from "react-map-gl/mapbox";
import type { POI } from "../types";
import { getCategoryColor, getCategoryIcon } from "../utils/categories";

const CAMPUS_MAP_TOKEN = import.meta.env.VITE_CAMPUS_MAP_TOKEN;
const CAMPUS_MAP_STYLE = import.meta.env.VITE_CAMPUS_MAP_STYLE;

interface CampusMapProps {
  pois: POI[];
  selectedPOI: POI | null;
  onSelectPOI: (poi: POI | null) => void;
}

export function CampusMap({ pois, selectedPOI, onSelectPOI }: CampusMapProps) {
  const mapRef = useRef<MapRef>(null);

  const handleMarkerClick = useCallback(
    (poi: POI) => {
      onSelectPOI(poi);
      mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: 17, duration: 500 });
    },
    [onSelectPOI],
  );

  return (
    <MapGL
      ref={mapRef}
      mapboxAccessToken={CAMPUS_MAP_TOKEN}
      initialViewState={{ longitude: -74.6554, latitude: 40.3473, zoom: 16, pitch: 0, bearing: 0 }}
      minZoom={14}
      maxZoom={19}
      maxBounds={[[-74.669, 40.338], [-74.645, 40.356]]}
      mapStyle={CAMPUS_MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      reuseMaps
      onClick={() => onSelectPOI(null)}
    >
      <NavigationControl position="top-right" showCompass />

      {pois.map((poi) => (
        <Marker
          key={poi.id}
          longitude={poi.lng}
          latitude={poi.lat}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleMarkerClick(poi);
          }}
        >
          <div
            className="flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-125"
            style={{
              backgroundColor: getCategoryColor(poi.cat),
              border: "2px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
            title={poi.name}
          >
            <span className="text-white text-[8px] font-bold">{getCategoryIcon(poi.cat)}</span>
          </div>
        </Marker>
      ))}

      {selectedPOI && (
        <Popup
          longitude={selectedPOI.lng}
          latitude={selectedPOI.lat}
          anchor="bottom"
          offset={[0, -14] as [number, number]}
          closeOnClick={false}
          onClose={() => onSelectPOI(null)}
          maxWidth="320px"
        >
          <div className="p-4 min-w-[240px]">
            {selectedPOI.img && (
              <img
                src={selectedPOI.img}
                alt={selectedPOI.name}
                className="w-full h-32 object-cover rounded-lg mb-3"
              />
            )}
            <h3 className="text-base font-bold text-gray-900">{selectedPOI.name}</h3>
            {selectedPOI.sub && <p className="text-xs text-gray-500 mt-0.5">{selectedPOI.sub}</p>}
            {selectedPOI.cat && (
              <span
                className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-2"
                style={{
                  backgroundColor: `${getCategoryColor(selectedPOI.cat)}20`,
                  color: getCategoryColor(selectedPOI.cat),
                }}
              >
                {selectedPOI.cat}
              </span>
            )}
            {selectedPOI.hours && (
              <p className="text-xs text-gray-600 mt-2">
                <span className="font-semibold">Hours:</span> {selectedPOI.hours}
              </p>
            )}
            {selectedPOI.desc && (
              <p className="text-xs text-gray-600 mt-2 line-clamp-3">{selectedPOI.desc}</p>
            )}
          </div>
        </Popup>
      )}
    </MapGL>
  );
}
