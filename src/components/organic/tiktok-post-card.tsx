"use client";

import { ExternalLink, Heart, MessageCircle, Play, Bookmark, Music, Image as ImageIcon, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, isPlayableVideoUrl } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { VideoPreview } from "@/components/ads/video-preview";
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
  // TikTok CDN gates cross-origin <video> reads on Referer headers
  // and 403s when the request comes straight from aiscan.io —
  // hence the same-origin proxy at /api/proxy/tiktok-video. Once
  // the upstream playAddr token expires (~24h after scan) the
  // proxy returns 502 and the <video> element fires onError, at
  // which point we transparently fall back to the static cover.
  // Instagram/Meta CDNs don't gate cross-origin reads so their
  // cards point at the direct URL; this special case is TikTok's
  // alone. Slideshows have no video_url, so they skip the branch.
  const hasPlayableVideo = !post.is_slideshow && isPlayableVideoUrl(post.video_url);
  const proxiedVideoUrl = hasPlayableVideo
    ? `/api/proxy/tiktok-video?postId=${encodeURIComponent(post.post_id)}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all">
      {/* Preview area — portrait 4/5 to hint at TikTok's vertical native
          format without breaking the grid rhythm too much. */}
      <div className="aspect-[4/5] bg-muted relative overflow-hidden group">
        {hasPlayableVideo && proxiedVideoUrl ? (
          <VideoPreview
            src={proxiedVideoUrl}
            poster={post.cover_url ?? undefined}
          />
        ) : post.cover_url ? (
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
        <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
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
          <div className="absolute top-2 right-2 pointer-events-none">
            <span className="inline-flex items-center rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
              {duration}
            </span>
          </div>
        )}

        {/* Bottom hover stats strip — gradient bottom-up so the video
            hover-play stays visible. Engagement chips are pointer-
            events-none to avoid hijacking the play trigger; the
            stats already repeat in the card body so no behaviour
            is lost when this strip is hidden. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center gap-3 text-white text-[11px] font-medium">
            <span className="flex items-center gap-1">
              <Play className="size-3" /> {formatNumber(post.play_count)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {formatNumber(post.digg_count)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" /> {formatNumber(post.comment_count)}
            </span>
          </div>
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
