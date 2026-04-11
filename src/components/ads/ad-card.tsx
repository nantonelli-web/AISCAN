import { ExternalLink, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { MaitAdExternal } from "@/types";

export function AdCard({ ad }: { ad: MaitAdExternal }) {
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Preview area */}
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {snapshotUrl && !isSnapshotHtml ? (
          // Direct image URL
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
                <Eye className="size-3" /> Vedi creativo su Meta Ad Library
              </a>
            )}
          </div>
        )}
        {ad.status === "ACTIVE" && (
          <Badge variant="gold" className="absolute top-2 right-2">
            ACTIVE
          </Badge>
        )}
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {ad.cta && <Badge variant="muted">{ad.cta}</Badge>}
          {ad.platforms?.slice(0, 3).map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
        {aiTags && (
          <div className="flex items-center gap-1 flex-wrap">
            {aiTags.sector && <Badge variant="gold">{aiTags.sector}</Badge>}
            {aiTags.tone && <Badge variant="outline">{aiTags.tone}</Badge>}
            {aiTags.objective && (
              <Badge variant="outline">{aiTags.objective}</Badge>
            )}
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
