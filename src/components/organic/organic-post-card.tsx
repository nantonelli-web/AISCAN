"use client";

import { ExternalLink, Heart, MessageCircle, Play, Eye, ImageIcon, Film, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { AI_TAGS_ENABLED } from "@/config/features";
import type { MaitOrganicPost } from "@/types";

export function OrganicPostCard({ post }: { post: MaitOrganicPost }) {
  const { t } = useT();

  const aiTags = (post.raw_data as Record<string, unknown> | null)?.ai_tags as
    | { sector?: string; tone?: string; objective?: string }
    | undefined;

  const isVideo = post.post_type === "Video" || post.post_type === "Reel";
  const typeLabel = post.post_type ?? "Image";
  const TypeIcon =
    typeLabel === "Reel" ? Film : isVideo ? Play : typeLabel === "Sidecar" ? ImageIcon : ImageIcon;

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all channel-rail"
      data-channel="instagram"
    >
      {/* Preview area — square aspect for Instagram */}
      <div className="aspect-square bg-muted relative overflow-hidden">
        {post.display_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.display_url}
            alt={post.caption?.slice(0, 80) ?? "Instagram post"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="size-10" />
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
            <TypeIcon className="size-3" />
            {typeLabel.toUpperCase()}
          </span>
        </div>

        {/* Engagement overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <Heart className="size-4" /> {post.likes_count >= 0 ? formatNumber(post.likes_count) : "—"}
          </span>
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <MessageCircle className="size-4" /> {post.comments_count >= 0 ? formatNumber(post.comments_count) : "—"}
          </span>
          {isVideo && post.video_views > 0 && (
            <span className="flex items-center gap-1.5 text-white text-sm font-medium">
              <Eye className="size-4" /> {formatNumber(post.video_views)}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        {post.caption && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {post.caption}
          </p>
        )}

        {/* Engagement stats */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart className="size-3" /> {post.likes_count >= 0 ? formatNumber(post.likes_count) : "—"}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" /> {post.comments_count >= 0 ? formatNumber(post.comments_count) : "—"}
          </span>
          {isVideo && post.video_play_count > 0 && (
            <span className="flex items-center gap-1">
              <Play className="size-3" /> {formatNumber(post.video_play_count)}
            </span>
          )}
        </div>

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

        {/* Mentions + tagged users — deduplicated union. mentions
            are @accounts cited in the caption; tagged_users are
            accounts tagged on the post itself. The two channels are
            semantically distinct but visually identical (both are
            @username chips), so we dedupe and show them together to
            keep the card tight. The detail page can break them out
            if a user needs the source distinction. */}
        {(() => {
          const accounts = [
            ...new Set([
              ...(post.mentions ?? []).filter(Boolean),
              ...(post.tagged_users ?? []).filter(Boolean),
            ]),
          ];
          if (accounts.length === 0) return null;
          const visible = accounts.slice(0, 4);
          const overflow = accounts.length - visible.length;
          return (
            <div className="flex items-center gap-1 flex-wrap">
              {visible.map((u) => (
                <Badge key={u} variant="outline" className="text-[10px]">
                  @{u}
                </Badge>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  +{overflow}
                </span>
              )}
            </div>
          );
        })()}

        {/* AI Tags (gated by AI_TAGS_ENABLED feature flag) */}
        {AI_TAGS_ENABLED && aiTags && (
          <div className="flex items-center gap-1 flex-wrap">
            <Sparkles className="size-3 text-gold shrink-0" />
            {aiTags.sector && <Badge variant="gold">{aiTags.sector}</Badge>}
            {aiTags.tone && <Badge variant="outline">{aiTags.tone}</Badge>}
            {aiTags.objective && <Badge variant="outline">{aiTags.objective}</Badge>}
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
              {t("organic", "viewOnInstagram")} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
