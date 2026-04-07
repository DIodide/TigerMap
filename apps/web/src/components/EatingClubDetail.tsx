import { ChevronLeft, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EatingClub } from "../types";

interface EatingClubDetailProps {
  club: EatingClub;
  onClose: () => void;
}

interface FullEvent {
  id: number;
  message_id: string;
  subject: string;
  author_name: string;
  author_email: string;
  date: string;
  body_text: string;
  images: string;
  listserv_url: string;
  event_type: string | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function EatingClubDetail({ club, onClose }: EatingClubDetailProps) {
  const [events, setEvents] = useState<FullEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<FullEvent | null>(null);

  useEffect(() => {
    fetch(`/api/eating-clubs/${encodeURIComponent(club.name)}/events?limit=20`)
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => {});
  }, [club.name]);

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-700 to-amber-600 text-white shrink-0">
        {selectedEvent ? (
          <button
            type="button"
            onClick={() => setSelectedEvent(null)}
            className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
        ) : (
          <img
            src={`/api/images/eating-clubs/sprites/${club.sprite}@2x.png`}
            alt=""
            className="w-6 h-6 rounded-full bg-white object-contain"
          />
        )}
        <span className="text-sm font-bold tracking-wide flex-1">
          {selectedEvent ? "Event Detail" : club.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedEvent ? (
          // ── Full event view ──
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{selectedEvent.subject}</h2>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
              {selectedEvent.event_type && (
                <span className="inline-flex items-center bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {selectedEvent.event_type}
                </span>
              )}
              <span>{formatDate(selectedEvent.date)}</span>
            </div>

            {selectedEvent.body_text && (
              <p className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {selectedEvent.body_text.split("-----")[0].trim()}
              </p>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">From:</span> {selectedEvent.author_name}
              </p>
              {selectedEvent.listserv_url && (
                <a
                  href={selectedEvent.listserv_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                >
                  <ExternalLink size={10} />
                  View on LISTSERV
                </a>
              )}
            </div>
          </div>
        ) : (
          // ── Event list view ──
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Recent Events ({events.length})
            </h4>
            {events.length > 0 ? (
              <div className="space-y-1">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors group"
                  >
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-amber-800">
                      {event.subject}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <span>{formatDate(event.date)}</span>
                      {event.event_type && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600">{event.event_type}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No recent events found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
