import { ExternalLink, MapPin, X } from "lucide-react";
import type { FreefoodPost } from "../types";

interface FreefoodDetailProps {
  post: FreefoodPost;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FreefoodDetail({ post, onClose }: FreefoodDetailProps) {
  const images: string[] = (() => {
    try {
      return JSON.parse(post.images);
    } catch {
      return [];
    }
  })();

  return (
    <div className="absolute bottom-4 right-4 z-20 w-[380px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white shrink-0">
        <span className="text-lg">🍕</span>
        <span className="text-sm font-bold tracking-wide flex-1">FREE FOOD</span>
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
        <h2 className="text-base font-bold text-gray-900 leading-snug">{post.subject}</h2>

        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
            <MapPin size={10} />
            {post.location_name}
          </span>
          <span>{timeAgo(post.date)}</span>
        </div>

        {/* Body */}
        {post.body_text && (
          <p className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {post.body_text.split("-----")[0].trim()}
          </p>
        )}

        {/* Images (proxied through our API to avoid expired LISTSERV auth) */}
        {images.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {images.map((_, i) => (
              <img
                key={i}
                src={`/api/freefood/image/${post.id}/${i}`}
                alt=""
                className="w-full rounded-lg object-cover max-h-48"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-600">From:</span> {post.author_name}
          </p>
          {post.listserv_url && (
            <a
              href={post.listserv_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium"
            >
              <ExternalLink size={10} />
              View on LISTSERV
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
