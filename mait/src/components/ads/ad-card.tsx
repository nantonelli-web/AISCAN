import { ImageIcon, Video, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { MaitAdExternal } from "@/types";

export function AdCard({ ad }: { ad: MaitAdExternal }) {
  const hasVideo = !!ad.video_url;
  const hasImage = !!ad.image_url;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="aspect-square bg-muted relative">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.image_url!}
            alt={ad.headline ?? "ad creative"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {hasVideo ? <Video className="size-8" /> : <ImageIcon className="size-8" />}
          </div>
        )}
        {ad.status === "ACTIVE" && (
          <Badge variant="gold" className="absolute top-2 left-2">
            ACTIVE
          </Badge>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        {ad.headline && (
          <p className="font-medium line-clamp-2 text-sm">{ad.headline}</p>
        )}
        {ad.ad_text && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {ad.ad_text}
          </p>
        )}
        <div className="flex items-center gap-1 flex-wrap mt-auto pt-2">
          {ad.cta && <Badge variant="muted">{ad.cta}</Badge>}
          {ad.platforms?.slice(0, 2).map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">
          <span>{formatDate(ad.start_date)}</span>
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
        </div>
      </div>
    </div>
  );
}
