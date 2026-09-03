/**
 * Locating the user for directions.
 *
 * Laptops have no GPS: Chromium estimates position from nearby Wi-Fi via a
 * network request that it rate-limits (backing off to one request per 2–10
 * minutes on a stationary machine), so a single high-accuracy request often
 * just times out. We try high accuracy briefly (phones with GPS answer fast),
 * then fall back to a low-accuracy request that accepts the browser's cached
 * estimate. Fixes from any source are remembered so repeat requests are instant.
 */

export interface Fix {
  lat: number;
  lng: number;
  /** meters */
  accuracy: number;
  /** epoch ms */
  at: number;
}

export type LocateError = "denied" | "unavailable" | "unsupported";

export type LocateResult = { ok: true; fix: Fix } | { ok: false; error: LocateError };

const RECENT_MS = 10 * 60 * 1000;
// Coarser than this is an IP-level guess, not somewhere to route from
const MAX_USABLE_ACCURACY_M = 2500;

let lastFix: Fix | null = null;

export function rememberFix(fix: Fix): void {
  if (fix.accuracy <= MAX_USABLE_ACCURACY_M) lastFix = fix;
}

export function getRecentFix(maxAgeMs = RECENT_MS): Fix | null {
  return lastFix && Date.now() - lastFix.at <= maxAgeMs ? lastFix : null;
}

/** Straight-line distance in meters. */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function request(options: PositionOptions): Promise<Fix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        }),
      reject,
      options,
    );
  });
}

const PERMISSION_DENIED = 1;
const isDenied = (err: unknown) =>
  (err as GeolocationPositionError | undefined)?.code === PERMISSION_DENIED;

export async function locate(): Promise<LocateResult> {
  if (!navigator.geolocation) return { ok: false, error: "unsupported" };

  let fix: Fix;
  try {
    fix = await request({ enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 });
  } catch (err) {
    if (isDenied(err)) return { ok: false, error: "denied" };
    // Timed out or unavailable — take whatever cached/network estimate the browser has
    try {
      fix = await request({ enableHighAccuracy: false, timeout: 15_000, maximumAge: RECENT_MS });
    } catch (err2) {
      return { ok: false, error: isDenied(err2) ? "denied" : "unavailable" };
    }
  }

  if (fix.accuracy > MAX_USABLE_ACCURACY_M) return { ok: false, error: "unavailable" };
  rememberFix(fix);
  return { ok: true, fix };
}
