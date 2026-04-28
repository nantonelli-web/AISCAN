"use client";

import { ExternalLink, Eye, Heart, MessageCircle, Play, Radio, Film } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitYoutubeVideo } from "@/types";

function formatDuration(s: number | null): string | null {
  if (s == null || !Number.isFinite(s) || s <= 0) return null;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function YoutubeVideoCard({ video }: { video: MaitYoutubeVideo }) {
  const { t } = useT();
  const duration = formatDuration(video.duration_seconds);
  const isShort = video.type === "short";
  const isStream = video.type === "stream";
  const TypeIcon = isStream ? Radio : isShort ? Play : Film;
  const typeLabel = isStream ? "LIVE" : isShort ? "SHORT" : "VIDEO";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 transition-colors">
      {/* Preview area — 16:9 for normal videos, 9:16 for shorts */}
      <div
        className={
          isShort
            ? "aspect-[4/5] bg-muted relative overflow-hidden"
            : "aspect-video bg-muted relative overflow-hidden"
        }
      >
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title?.slice(0, 80) ?? "YouTube video"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Play className="size-10" />
          </div>
        )}

        {/* Top-left: type badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
            <TypeIcon className="size-3" />
            {typeLabel}
          </span>
        </div>

        {/* Top-right: duration */}
        {duration && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
              {duration}
            </span>
          </div>
        )}

        {/* Hover engagement overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-5">
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <Eye className="size-4" /> {formatNumber(video.view_count)}
          </span>
          {video.like_count != null && (
            <span className="flex items-center gap-1.5 text-white text-sm font-medium">
              <Heart className="size-4" /> {formatNumber(video.like_count)}
            </span>
          )}
          {video.comment_count != null && (
            <span className="flex items-center gap-1.5 text-white text-sm font-medium">
              <MessageCircle className="size-4" /> {formatNumber(video.comment_count)}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        {video.title && (
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {video.title}
          </p>
        )}

        {/* Engagement stats — views + likes when available */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Eye className="size-3" /> {formatNumber(video.view_count)}
          </span>
          {video.like_count != null && (
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {formatNumber(video.like_count)}
            </span>
          )}
          {video.comment_count != null && (
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" /> {formatNumber(video.comment_count)}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border mt-auto">
          {/* The actor only exposes the relative date string ("1 month
              ago"); we use the parsed `posted_at` for sortability and
              show the original copy here so the user can see the
              actor's own claim, not our approximation. */}
          <span>
            {video.posted_relative ?? formatDate(video.posted_at)}
          </span>
          {video.video_url && (
            <a
              href={video.video_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              {t("organic", "viewOnYoutube")} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
