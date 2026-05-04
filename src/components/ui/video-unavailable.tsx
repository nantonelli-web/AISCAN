"use client";

import { CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Crossed-out play placeholder for VIDEO content where the
 * source (Apify actor / platform CDN) didn't deliver a usable
 * preview. The previous fallback was a plain grey box that
 * looked like a malfunction; this component spells out
 * "il video non ci è arrivato" so the user knows the gap is
 * intentional and not a bug.
 *
 * Use when:
 *   • post_type / format = "video" / "reel" AND
 *   • neither video_url nor a usable cover/display image is
 *     present.
 *
 * Renders fill-parent so the parent's aspect-ratio container
 * keeps the same height as a real preview would.
 */
export function VideoUnavailable({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center bg-gradient-to-br from-muted/40 to-muted/70",
        className,
      )}
    >
      <div className="relative">
        <CircleSlash className="size-10 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground max-w-[180px]">
        Anteprima non disponibile — la piattaforma non ha esposto il
        video di questa creatività.
      </p>
    </div>
  );
}
