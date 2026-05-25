"use client";

import { useState } from "react";
import { ExternalLink, Heart, MessageCircle, Play, Eye, ImageIcon, Film, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, isPlayableVideoUrl } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { AI_TAGS_ENABLED } from "@/config/features";
import { VideoPreview } from "@/components/ads/video-preview";
import { VideoUnavailable } from "@/components/ui/video-unavailable";
import { SaveToCollection } from "@/components/ads/save-to-collection";
import { isCollabPost } from "@/lib/organic/collaborations";
import type { MaitOrganicPost } from "@/types";

export function OrganicPostCard({
  post,
  selfHandle,
}: {
  post: MaitOrganicPost;
  /** L'handle Instagram del brand stesso, per escludere auto-tag dal
   *  detection collaborazioni. Senza questo, ogni post sarebbe
   *  "collab" perche' i brand si auto-taggano. */
  selfHandle?: string | null;
}) {
  const { t } = useT();
  const isCollab = isCollabPost(
    post.mentions,
    post.tagged_users,
    selfHandle,
    post.caption,
  );
  // Display URL pointing direttamente a Instagram CDN
  // (instagram.fcps*.fna.fbcdn.net / scontent-*) ha
  // signature time-limited e dopo poche ore restituisce 403/404,
  // mentre i post mirrorati su Supabase storage restano stabili.
  // Il mirror non sempre va a buon fine al scan time, quindi
  // tracciamo l'errore di load lato client e cadiamo sul
  // placeholder con CTA al post originale.
  const [imgFailed, setImgFailed] = useState(false);

  const aiTags = (post.raw_data as Record<string, unknown> | null)?.ai_tags as
    | { sector?: string; tone?: string; objective?: string }
    | undefined;

  const isVideo = post.post_type === "Video" || post.post_type === "Reel";
  const typeLabel = post.post_type ?? "Image";
  const TypeIcon =
    typeLabel === "Reel" ? Film : isVideo ? Play : typeLabel === "Sidecar" ? ImageIcon : ImageIcon;
  // Instagram CDN .mp4 URLs play directly through <video>. The cover
  // (display_url) doubles as the poster so the static frame matches
  // what the user sees before hover.
  const hasPlayableVideo = isVideo && isPlayableVideoUrl(post.video_url);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all">
      {/* Preview area — square aspect for Instagram */}
      <div className="aspect-square bg-muted relative overflow-hidden group">
        {hasPlayableVideo && post.video_url ? (
          <VideoPreview
            src={post.video_url}
            poster={post.display_url ?? undefined}
          />
        ) : post.display_url && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.display_url}
            alt={post.caption?.slice(0, 80) ?? "Instagram post"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : isVideo ? (
          // Video / Reel with neither playable URL nor cover —
          // explicit placeholder so the user knows the missing
          // preview is a source-side issue, not a UI bug.
          <VideoUnavailable />
        ) : (
          // Anteprima non disponibile: o display_url e' null, o
          // l'IG CDN ha rifiutato il fetch. Render placeholder
          // cliccabile che porta al post originale dove il
          // contenuto e' sempre visibile.
          <a
            href={post.post_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-gold transition-colors"
            aria-label={t("organic", "previewUnavailable")}
          >
            <ImageIcon className="size-10" />
            <span className="text-[10px] font-medium uppercase tracking-wider px-3 text-center leading-tight">
              {t("organic", "previewUnavailable")}
            </span>
            {post.post_url && (
              <span className="text-[10px] inline-flex items-center gap-1">
                {t("organic", "viewOnInstagram")}
                <ExternalLink className="size-3" />
              </span>
            )}
          </a>
        )}

        {/* Save to collection — top-left, coerente con AdCard */}
        <div className="absolute top-2 left-2 z-10">
          <SaveToCollection itemType="instagram_post" itemId={post.id} />
        </div>
        {/* Type badge — shiftato a destra del bottone salva */}
        <div className="absolute top-2 left-11 pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
            <TypeIcon className="size-3" />
            {typeLabel.toUpperCase()}
          </span>
        </div>

        {/* Collaborazione badge — appare in top-right quando il post
            tagga/menziona almeno un account ≠ brand stesso. Signal
            forte di influencer/ambassador/collab brand. */}
        {isCollab && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black shadow-sm">
              <Users className="size-3" />
              {t("organic", "collabBadge")}
            </span>
          </div>
        )}

        {/* Bottom hover stats strip — gradient + small chips at the
            bottom keep the engagement numbers visible without
            obscuring the video that plays on hover. The stats also
            repeat in the card body, so this strip is purely a
            preview-layer aid. pointer-events-none so the video
            still receives the mouseenter that triggers playback. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center gap-3 text-white text-[11px] font-medium">
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {post.likes_count >= 0 ? formatNumber(post.likes_count) : "—"}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" /> {post.comments_count >= 0 ? formatNumber(post.comments_count) : "—"}
            </span>
            {isVideo && post.video_views > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="size-3" /> {formatNumber(post.video_views)}
              </span>
            )}
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
