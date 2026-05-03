"use client";

import { ExternalLink, Heart, MessageCircle, Play, Bookmark, Music, Image as ImageIcon, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitTikTokPost } from "@/types";

function formatDuration(s: number | null): string | null {
  if (s == null || !Number.isFinite(s) || s <= 0) return null;
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function TikTokPostCard({ post }: { post: MaitTikTokPost }) {
  const { t } = useT();
  const duration = formatDuration(post.duration_seconds);

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all channel-rail"
      data-channel="tiktok"
    >
      {/* Preview area — portrait 4/5 to hint at TikTok's vertical native
          format without breaking the grid rhythm too much. */}
      <div className="aspect-[4/5] bg-muted relative overflow-hidden">
        {post.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_url}
            alt={post.caption?.slice(0, 80) ?? "TikTok video"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Play className="size-10" />
          </div>
        )}

        {/* Top-left: type badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
            {post.is_slideshow ? <ImageIcon className="size-3" /> : <Play className="size-3" />}
            {post.is_slideshow ? "SLIDES" : "VIDEO"}
          </span>
          {post.is_pinned && (
            <span className="inline-flex items-center gap-1 rounded bg-gold/90 px-1.5 py-0.5 text-[10px] font-medium text-black">
              <Pin className="size-3" />
              PIN
            </span>
          )}
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
            <Play className="size-4" /> {formatNumber(post.play_count)}
          </span>
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <Heart className="size-4" /> {formatNumber(post.digg_count)}
          </span>
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <MessageCircle className="size-4" /> {formatNumber(post.comment_count)}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        {post.caption && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {post.caption}
          </p>
        )}

        {/* Engagement stats — TikTok-native: views > likes > comments > saves */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Play className="size-3" /> {formatNumber(post.play_count)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" /> {formatNumber(post.digg_count)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" /> {formatNumber(post.comment_count)}
          </span>
          {post.collect_count > 0 && (
            <span className="flex items-center gap-1">
              <Bookmark className="size-3" /> {formatNumber(post.collect_count)}
            </span>
          )}
        </div>

        {/* Music — TikTok's signature metadata. Original sound vs. licensed
            track is the second-most-important signal after engagement. */}
        {(post.music_name || post.music_author) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Music className="size-3 shrink-0" />
            <span className="truncate">
              {post.music_name ?? "—"}
              {post.music_author && (
                <span className="text-muted-foreground/70"> · {post.music_author}</span>
              )}
            </span>
            {post.music_original && (
              <Badge variant="gold" className="text-[9px] py-0 px-1.5 shrink-0">
                ORIG
              </Badge>
            )}
          </div>
        )}

        {/* Hashtags */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {post.hashtags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                #{tag}
              </Badge>
            ))}
            {post.hashtags.length > 4 && (
              <span className="text-[10px] text-muted-foreground">
                +{post.hashtags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Mentions */}
        {post.mentions && post.mentions.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {post.mentions.slice(0, 4).map((u) => (
              <Badge key={u} variant="outline" className="text-[10px]">
                @{u}
              </Badge>
            ))}
            {post.mentions.length > 4 && (
              <span className="text-[10px] text-muted-foreground">
                +{post.mentions.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border mt-auto">
          <span>{formatDate(post.posted_at)}</span>
          {post.post_url && (
            <a
              href={post.post_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              {t("organic", "viewOnTiktok")} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
