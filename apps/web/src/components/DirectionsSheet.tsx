/**
 * Directions bottom sheet — slides up from the bottom when a destination is
 * chosen. Dark panel, walking/cycling toggle with live ETAs, orange accent
 * matching the route line.
 */

import { Bike, Footprints, LocateFixed, MapPin, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LatLng, RouteInfo, TravelProfile } from "../utils/directions";
import { formatArrival, formatDistance, formatMinutes } from "../utils/directions";
import type { LocateError } from "../utils/geolocation";

export interface DirectionsState {
  dest: { name: string; lat: number; lng: number; cat?: string };
  origin: LatLng | null;
  routes: Partial<Record<TravelProfile, RouteInfo>> | null;
  profile: TravelProfile;
  status: "locating" | "routing" | "ready" | "no-location" | "error";
  /** Why locating failed, when status is "no-location" */
  locateError: LocateError | null;
}

const LOCATE_MESSAGES: Record<LocateError, string> = {
  denied: "Location is blocked for this site",
  unavailable: "Couldn't get a fix on your location",
  unsupported: "This browser can't share your location",
};

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

  // Expanded state reveals turn-by-turn steps (mobile only; desktop always
  // shows them). Swipe up on the sheet header expands, swipe down collapses
  // or dismisses; tapping the handle toggles.
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);
  // Ref mirror of dragY: touchend must read the final value even if React
  // hasn't committed the last touchmove's state update yet.
  const lastDy = useRef(0);

  // New destination — start collapsed again
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on dest
  useEffect(() => setExpanded(false), [dest]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Elastic feedback while dragging, capped so the sheet never flies away
    const capped = Math.max(-28, Math.min(64, dy * 0.5));
    lastDy.current = capped;
    setDragY(capped);
  };
  const onTouchEnd = () => {
    const dy = lastDy.current;
    touchStartY.current = null;
    lastDy.current = 0;
    setDragY(0);
    if (dy < -10) setExpanded(true);
    else if (dy > 16) {
      if (expanded) setExpanded(false);
      else onClose();
    }
  };

  const subline =
    status === "locating"
      ? "Finding your location…"
      : status === "routing"
        ? "Finding the fastest paths…"
        : status === "ready" && active
          ? `${formatDistance(active.distanceM)} · arrive ${formatArrival(active.durationS)}`
          : status === "no-location"
            ? LOCATE_MESSAGES[state.locateError ?? "unavailable"]
            : "No route found";

  return (
    <div className="directions-sheet-wrap">
      <div
        className="directions-sheet"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        {/* Drag/tap header: handle + destination + close */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div
            className="relative flex justify-center pt-2.5 pb-1 sm:pt-3"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="h-1 w-9 rounded-full bg-[#48484a] sm:hidden" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
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
        </div>

        {/* Actions */}
        <div className="mt-3.5">
          {status === "no-location" && state.locateError === "denied" ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e77500] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d06a00]"
              >
                <LocateFixed size={17} />
                Enable location
              </button>
              <p className="mt-2.5 text-xs leading-relaxed text-gray-500">
                Allow location for this site in your browser's site settings. On a Mac, your browser
                also needs Location Services on under System Settings → Privacy &amp; Security.
              </p>
            </>
          ) : status === "no-location" && state.locateError === "unsupported" ? null : status ===
            "no-location" ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e77500] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d06a00]"
            >
              <RefreshCw size={16} />
              Try again
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

        {/* Turn-by-turn steps */}
        {status === "ready" && active && active.steps.length > 0 && (
          <div className={`steps-wrap ${expanded ? "steps-open" : ""}`}>
            <div className="steps-inner">
              <ol className="steps-list mt-3.5 divide-y divide-[#2c2c2e] border-t border-[#2c2c2e]">
                {active.steps.map((step, i) => (
                  <li
                    key={`${i}-${step.instruction}`}
                    className="flex items-baseline justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm leading-snug text-gray-200">{step.instruction}</span>
                    {step.distanceM > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {formatDistance(step.distanceM)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
