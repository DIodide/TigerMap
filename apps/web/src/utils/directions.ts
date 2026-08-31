/**
 * Mapbox Directions API — walking + cycling routes between two campus points.
 */

const TOKEN = import.meta.env.VITE_TIGERAPPS_MAPBOX_TOKEN;

export type TravelProfile = "walking" | "cycling";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
}

export interface RouteInfo {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
}

async function fetchRoute(
  profile: TravelProfile,
  origin: LatLng,
  dest: LatLng,
): Promise<RouteInfo | null> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${origin.lng},${origin.lat};${dest.lng},${dest.lat}` +
    `?geometries=geojson&overview=full&steps=true&access_token=${TOKEN}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const route = data.code === "Ok" ? data.routes?.[0] : null;
    if (!route) return null;
    const steps: RouteStep[] = (route.legs?.[0]?.steps ?? [])
      .map((s: any) => ({ instruction: s.maneuver?.instruction ?? "", distanceM: s.distance ?? 0 }))
      .filter((s: RouteStep) => s.instruction);
    return {
      geometry: route.geometry,
      distanceM: route.distance,
      durationS: route.duration,
      steps,
    };
  } catch {
    return null;
  }
}

export async function fetchRoutes(
  origin: LatLng,
  dest: LatLng,
): Promise<Partial<Record<TravelProfile, RouteInfo>>> {
  const [walking, cycling] = await Promise.all([
    fetchRoute("walking", origin, dest),
    fetchRoute("cycling", origin, dest),
  ]);
  const routes: Partial<Record<TravelProfile, RouteInfo>> = {};
  if (walking) routes.walking = walking;
  if (cycling) routes.cycling = cycling;
  return routes;
}

export function formatMinutes(durationS: number): string {
  return `${Math.max(1, Math.round(durationS / 60))} min`;
}

export function formatDistance(distanceM: number): string {
  const miles = distanceM / 1609.34;
  if (miles < 0.1) return `${Math.round((distanceM * 3.28084) / 10) * 10} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function formatArrival(durationS: number): string {
  return new Date(Date.now() + durationS * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
