import Link from "next/link";
import { ExternalLink, Eye, Sparkles, Play, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SaveToCollection } from "@/components/ads/save-to-collection";
import { VideoPreview } from "@/components/ads/video-preview";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitAdExternal } from "@/types";

export async function AdCard({
  ad,
  competitorId,
}: {
  ad: MaitAdExternal;
  competitorId?: string;
}) {
  const locale = await getLocale();
  const t = serverT(locale);

  const aiTags = (ad.raw_data as Record<string, unknown> | null)?.ai_tags as
    | { sector?: string; tone?: string; objective?: string }
    | undefined;

  const raw = ad.raw_data as Record<string, unknown> | null;
  const adLibraryUrl =
    (raw?.adLibraryURL as string) ??
    (ad.ad_archive_id
      ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
      : null);
  const pageName = (raw?.pageName as string) ?? null;
  const snapshotUrl = (raw?.adSnapshotUrl as string) ?? ad.image_url;
  const isSnapshotHtml = snapshotUrl?.includes("/render_ad/");
  const detailHref =
    competitorId ?? ad.competitor_id
      ? `/competitors/${competitorId ?? ad.competitor_id}/ads/${ad.id}`
      : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 transition-colors">
      {/* Preview area */}
      <MaybeLink href={detailHref} className="aspect-[4/3] bg-muted relative overflow-hidden block cursor-pointer">
        {ad.video_url ? (
          <VideoPreview
            src={ad.video_url}
            poster={snapshotUrl && !isSnapshotHtml ? snapshotUrl : undefined}
          />
        ) : snapshotUrl && !isSnapshotHtml ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshotUrl}
            alt={ad.headline ?? "ad creative"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          // Text preview (when no direct image available)
          <div className="absolute inset-0 p-4 flex flex-col justify-between">
            <div className="space-y-2">
              {pageName && (
                <p className="text-[10px] uppercase tracking-widest text-gold truncate">
                  {pageName}
                </p>
              )}
              {ad.headline && (
                <p className="font-semibold text-sm line-clamp-2">
                  {ad.headline}
                </p>
              )}
              {ad.ad_text && (
                <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                  {ad.ad_text}
                </p>
              )}
            </div>
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] text-gold hover:underline mt-auto"
              >
                <Eye className="size-3" /> {t("adCard", "viewOnMeta")}
              </a>
            )}
          </div>
        )}
        {ad.status === "ACTIVE" && (
          <Badge variant="gold" className="absolute top-2 right-2">
            ACTIVE
          </Badge>
        )}
        <div className="absolute top-2 left-2">
          <SaveToCollection adId={ad.id} />
        </div>
        <div className="absolute bottom-2 left-2">
          {ad.video_url ? (
            <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Play className="size-3" /> VIDEO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
              <ImageIcon className="size-3" /> IMAGE
            </span>
          )}
        </div>
      </MaybeLink>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        {ad.headline && (
          <p className="font-medium line-clamp-2 text-sm">{ad.headline}</p>
        )}
        {ad.ad_text && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {ad.ad_text}
          </p>
        )}
        {ad.cta && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">CTA:</span>
            <Badge variant="muted">{ad.cta}</Badge>
          </div>
        )}
        {aiTags ? (
          <div className="flex items-center gap-1 flex-wrap">
            <Sparkles className="size-3 text-gold shrink-0" />
            {aiTags.sector && <Badge variant="gold">{aiTags.sector}</Badge>}
            {aiTags.tone && <Badge variant="outline">{aiTags.tone}</Badge>}
            {aiTags.objective && (
              <Badge variant="outline">{aiTags.objective}</Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <Sparkles className="size-3" />
            <span>{t("adCard", "notAnalyzed")}</span>
          </div>
        )}
        {ad.platforms && ad.platforms.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{t("adCard", "onPlatforms")}</span>
            <span>{ad.platforms.join(" \u00B7 ")}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border mt-auto">
          <span>{formatDate(ad.start_date)}</span>
          <div className="flex items-center gap-2">
            {ad.landing_url && (
              <a
                href={ad.landing_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-gold flex items-center gap-1"
              >
                landing <ExternalLink className="size-3" />
              </a>
            )}
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-gold flex items-center gap-1"
              >
                ad library <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaybeLink({
  href,
  children,
  className,
}: {
  href: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}
