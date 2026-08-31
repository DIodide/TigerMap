/**
 * Directions bottom sheet — slides up from the bottom when a destination is
 * chosen. Dark panel, walking/cycling toggle with live ETAs, orange accent
 * matching the route line.
 */

import { Bike, Footprints, LocateFixed, MapPin, X } from "lucide-react";
import type { LatLng, RouteInfo, TravelProfile } from "../utils/directions";
import { formatArrival, formatDistance, formatMinutes } from "../utils/directions";

export interface DirectionsState {
  dest: { name: string; lat: number; lng: number; cat?: string };
  origin: LatLng | null;
  routes: Partial<Record<TravelProfile, RouteInfo>> | null;
  profile: TravelProfile;
  status: "locating" | "routing" | "ready" | "no-location" | "error";
}

interface DirectionsSheetProps {
  state: DirectionsState;
  onSelectProfile: (profile: TravelProfile) => void;
  onRetry: () => void;
  onClose: () => void;
}

const ORANGE = "#e77500";

function ModeButton({
  profile,
  route,
  active,
  loading,
  onClick,
}: {
  profile: TravelProfile;
  route: RouteInfo | undefined;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const Icon = profile === "walking" ? Footprints : Bike;
  const label = profile === "walking" ? "Walk" : "Bike";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || !route}
      aria-label={route ? `${label}, ${formatMinutes(route.durationS)}` : label}
      className={`flex items-center justify-center gap-2.5 rounded-xl py-3 transition-colors ${
        active && route
          ? "bg-[#e77500] text-white"
          : "bg-[#2c2c2e] text-gray-200 hover:bg-[#3a3a3c] disabled:hover:bg-[#2c2c2e]"
      }`}
    >
      <Icon size={19} strokeWidth={2.2} className="shrink-0" />
      <span className="text-sm font-semibold tabular-nums">
        {loading ? (
          <span className="animate-pulse text-gray-400">…</span>
        ) : route ? (
          formatMinutes(route.durationS)
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </span>
    </button>
  );
}

export function DirectionsSheet({
  state,
  onSelectProfile,
  onRetry,
  onClose,
}: DirectionsSheetProps) {
  const { dest, routes, profile, status } = state;
  const active = routes?.[profile];
  const loading = status === "locating" || status === "routing";

  const subline =
    status === "locating"
      ? "Finding your location…"
      : status === "routing"
        ? "Finding the fastest paths…"
        : status === "ready" && active
          ? `${formatDistance(active.distanceM)} · arrive ${formatArrival(active.durationS)}`
          : status === "no-location"
            ? "Directions need your location"
            : "No route found";

  return (
    <div className="directions-sheet-wrap">
      <div className="directions-sheet">
        {/* Drag handle (mobile) + close */}
        <div className="relative flex justify-center pt-2.5 pb-1 sm:pt-3">
          <div className="h-1 w-9 rounded-full bg-[#48484a] sm:hidden" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close directions"
            className="absolute right-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#2c2c2e] hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {/* Destination */}
        <div className="flex items-start gap-3 pr-9">
          <MapPin size={20} className="mt-0.5 shrink-0" style={{ color: ORANGE }} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-snug text-white">
              {dest.name}
            </h2>
            <p
              className={`mt-0.5 text-sm text-gray-400 ${loading ? "animate-pulse" : ""}`}
              aria-live="polite"
            >
              {subline}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3.5">
          {status === "no-location" ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e77500] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d06a00]"
            >
              <LocateFixed size={17} />
              Enable location
            </button>
          ) : status === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-xl bg-[#e77500] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d06a00]"
            >
              Try again
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                profile="walking"
                route={routes?.walking}
                active={profile === "walking"}
                loading={loading}
                onClick={() => onSelectProfile("walking")}
              />
              <ModeButton
                profile="cycling"
                route={routes?.cycling}
                active={profile === "cycling"}
                loading={loading}
                onClick={() => onSelectProfile("cycling")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
