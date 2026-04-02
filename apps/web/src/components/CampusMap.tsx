import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapGL, type MapRef, Marker, NavigationControl, Popup } from "react-map-gl/mapbox";
import type { FreefoodPost, POI } from "../types";
import { getCategoryColor, getCategoryIcon } from "../utils/categories";

const CAMPUS_MAP_TOKEN = import.meta.env.VITE_CAMPUS_MAP_TOKEN;
const CAMPUS_MAP_STYLE = import.meta.env.VITE_CAMPUS_MAP_STYLE;
const TIGERAPPS_TOKEN = import.meta.env.VITE_TIGERAPPS_MAPBOX_TOKEN;

interface CampusMapProps {
  pois: POI[];
  selectedPOI: POI | null;
  onSelectPOI: (poi: POI | null) => void;
  freefoodPosts: FreefoodPost[];
  selectedFreefood: FreefoodPost | null;
  onSelectFreefood: (post: FreefoodPost | null) => void;
}

export function CampusMap({
  pois,
  selectedPOI,
  onSelectPOI,
  freefoodPosts,
  selectedFreefood,
  onSelectFreefood,
}: CampusMapProps) {
  const mapRef = useRef<MapRef>(null);

  const handleMarkerClick = useCallback(
    (poi: POI) => {
      onSelectPOI(poi);
      onSelectFreefood(null);
      mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: 17, duration: 500 });
    },
    [onSelectPOI, onSelectFreefood],
  );

  const handleFoodClick = useCallback(
    (post: FreefoodPost) => {
      onSelectFreefood(post);
      onSelectPOI(null);
      mapRef.current?.flyTo({ center: [post.lng, post.lat], zoom: 17, duration: 500 });
    },
    [onSelectPOI, onSelectFreefood],
  );

  // Fetch Princeton's style, inject TigerApps tileset sources + custom layers
  const [mapStyle, setMapStyle] = useState<object | string | undefined>(undefined);

  useEffect(() => {
    const styleUrl = `https://api.mapbox.com/styles/v1/applied-information-group/cld1kdenc001001m89xs12zvl?access_token=${CAMPUS_MAP_TOKEN}`;
    fetch(styleUrl)
      .then((r) => r.json())
      .then((style) => {
        // Add TigerApps tilesets to the composite source
        const originalUrl: string = style.sources.composite.url;
        style.sources.composite.url =
          originalUrl + ",tigerapps.downtown-princeton-buildings,tigerapps.8mfuncwk";

        // Find insertion point: before first symbol layer
        const firstSymIdx = style.layers.findIndex((l: { type: string }) => l.type === "symbol");
        const insertAt = firstSymIdx >= 0 ? firstSymIdx : style.layers.length;

        // Downtown buildings (campus-green style, before labels)
        const overlayLayers = [
          {
            id: "downtown-buildings-shadow",
            type: "fill",
            source: "composite",
            "source-layer": "downtown-princeton-buildings",
            paint: { "fill-color": "rgba(0,0,0,0.08)", "fill-translate": [2, 2] },
          },
          {
            id: "downtown-buildings",
            type: "fill",
            source: "composite",
            "source-layer": "downtown-princeton-buildings",
            paint: { "fill-color": "#b8c8b0", "fill-opacity": 0.85 },
          },
          {
            id: "downtown-buildings-outline",
            type: "line",
            source: "composite",
            "source-layer": "downtown-princeton-buildings",
            paint: { "line-color": "#8fa087", "line-width": 0.5, "line-opacity": 0.6 },
          },
          // Highlighted restaurants (light red)
          {
            id: "highlighted-restaurants-fill",
            type: "fill",
            source: "composite",
            "source-layer": "highlighted-restaurants-3jo06s",
            paint: { "fill-color": "#e8b0b0", "fill-opacity": 0.85 },
          },
          {
            id: "highlighted-restaurants-outline",
            type: "line",
            source: "composite",
            "source-layer": "highlighted-restaurants-3jo06s",
            paint: { "line-color": "#c49090", "line-width": 1 },
          },
        ];

        style.layers.splice(insertAt, 0, ...overlayLayers);

        // Labels (at the top)
        style.layers.push(
          {
            id: "downtown-buildings-labels",
            type: "symbol",
            source: "composite",
            "source-layer": "downtown-princeton-buildings",
            filter: ["has", "name"],
            layout: {
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-font": ["Open Sans SemiBold", "Arial Unicode MS Regular"],
              "text-max-width": 8,
              "text-anchor": "center",
            },
            paint: {
              "text-color": "#3d3d3d",
              "text-halo-color": "rgba(255,255,255,0.8)",
              "text-halo-width": 1,
            },
          },
          {
            id: "highlighted-restaurants-labels",
            type: "symbol",
            source: "composite",
            "source-layer": "highlighted-restaurants-3jo06s",
            filter: ["has", "name"],
            layout: {
              "text-field": ["get", "name"],
              "text-size": 12,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
              "text-max-width": 7,
              "text-anchor": "center",
              "text-allow-overlap": true,
            },
            paint: {
              "text-color": "#002e2c",
              "text-halo-color": "#ffffff",
              "text-halo-width": 2,
            },
          },
        );

        setMapStyle(style);
      })
      .catch(() => {
        // Fallback to the original Princeton style URL if fetch fails
        setMapStyle(CAMPUS_MAP_STYLE);
      });
  }, []);

  if (!mapStyle) return <div style={{ width: "100%", height: "100%" }} />;

  return (
    <MapGL
      ref={mapRef}
      mapboxAccessToken={CAMPUS_MAP_TOKEN}
      transformRequest={(url: string) => {
        // Route TigerApps tileset requests through the TigerApps token
        if (url.includes("tigerapps.") && TIGERAPPS_TOKEN) {
          return { url: url.replace(/access_token=[^&]+/, `access_token=${TIGERAPPS_TOKEN}`) };
        }
      }}
      initialViewState={{ longitude: -74.6554, latitude: 40.3473, zoom: 16, pitch: 0, bearing: 0 }}
      minZoom={14}
      maxZoom={19}
      maxBounds={[
        [-74.675, 40.335],
        [-74.645, 40.358],
      ]}
      mapStyle={mapStyle}
      style={{ width: "100%", height: "100%" }}
      reuseMaps
      onClick={() => { onSelectPOI(null); onSelectFreefood(null); }}
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

      {/* Free food markers */}
      {freefoodPosts.map((post) => (
        <Marker
          key={`food-${post.id}`}
          longitude={post.lng}
          latitude={post.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleFoodClick(post);
          }}
        >
          <div className="freefood-marker-wrapper" title={post.subject}>
            <div
              className={`freefood-marker ${selectedFreefood?.id === post.id ? "freefood-marker-selected" : ""}`}
            >
              <span className="text-base leading-none">🍕</span>
            </div>
            <div className="freefood-marker-stem" />
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
