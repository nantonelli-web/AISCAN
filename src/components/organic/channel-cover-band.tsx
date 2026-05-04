"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import { Search as SearchIcon, MapPin } from "lucide-react";

/**
 * Channel cover band — wide gradient banner identical in spirit to
 * the YouTube channel banner the user liked. Replaces "no header at
 * all" on Meta / Google / Instagram / TikTok / Snapchat / SERP /
 * Maps with a recognisable channel-themed cover.
 *
 * Why a generated gradient and not real banner art: only YouTube
 * exposes a per-account banner image in our scraping pipeline (and
 * the rest don't have an equivalent concept). A channel-coloured
 * gradient gives the same "this is the X section" recognition
 * without inventing fake data — same approach used for the channel
 * rails on cards elsewhere.
 *
 * The component renders ONLY the cover band (aspect-[6/1] by
 * default). Callers stack their own profile content underneath as
 * they see fit. SnapchatProfileCard and YoutubeChannelCard already
 * handle their own banners; this component is for the channels
 * that previously had nothing.
 */
type ChannelKey =
  | "meta"
  | "google"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  | "serp"
  | "maps";

const channelGradients: Record<ChannelKey, string> = {
  meta: "from-[#1877f2] via-[#3b82f6] to-[#0e3590]",
  google: "from-[#ea4335] via-[#fbbc05] to-[#34a853]",
  instagram: "from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
  tiktok: "from-[#0f1115] via-[#14b8a6] to-[#ff0050]",
  snapchat: "from-[#fffc00] via-[#fff200] to-[#fcd34d]",
  youtube: "from-[#7f0000] via-[#ff0000] to-[#ffaa00]",
  serp: "from-[#4285f4] via-[#34a853] to-[#0e3590]",
  maps: "from-[#34a853] via-[#0f9d58] to-[#137333]",
};

const channelIcons: Record<ChannelKey, React.ComponentType<{ className?: string }>> = {
  meta: MetaIcon,
  google: GoogleIconInline,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  snapchat: SnapchatIcon,
  youtube: YouTubeIcon,
  serp: SearchIcon,
  maps: MapPin,
};

const channelLabels: Record<ChannelKey, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  instagram: "Instagram",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  youtube: "YouTube",
  serp: "Google SERP",
  maps: "Google Maps",
};

/** Channels whose gradient is light-coloured — text needs to be
 *  dark on the cover overlay (Snapchat is the obvious one). */
const lightCoverChannels: ChannelKey[] = ["snapchat"];

function GoogleIconInline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

export function ChannelCoverBand({
  channel,
  brandName,
  brandHandle,
  brandAvatar,
  caption,
  className,
}: {
  channel: ChannelKey;
  /** Brand name overlaid on the cover (top right). Often the same
   *  as the page hero, but kept here so each channel section
   *  reads as a self-contained "brand × channel" intro. */
  brandName?: string;
  /** @username / handle — shown under the brand name. */
  brandHandle?: string;
  /** Optional small avatar overlay. Used by Snapchat / Instagram
   *  account cards but skipped for paid channels (the brand hero
   *  already shows the avatar at the top of the page). */
  brandAvatar?: string | null;
  /** Single-line caption. e.g. "12 ads attive · 3 paesi". */
  caption?: string;
  className?: string;
}) {
  const Icon = channelIcons[channel];
  const isLight = lightCoverChannels.includes(channel);
  const overlayClass = isLight ? "text-foreground/90" : "text-white";

  return (
    <div
      className={cn(
        "relative aspect-[6/1] w-full overflow-hidden rounded-t-xl",
        "bg-gradient-to-br",
        channelGradients[channel],
        className,
      )}
    >
      {/* Channel logo, large + faded — gives the band a distinctive
          "channel watermark" look while the brand info (right) keeps
          the focus. */}
      <div
        className={cn(
          "absolute left-6 top-1/2 -translate-y-1/2 opacity-70",
          isLight ? "text-foreground/80" : "text-white/95",
        )}
      >
        <Icon className="size-12" />
      </div>

      {/* Channel name top-left, eyebrow style */}
      <div className={cn("absolute left-24 top-4", overlayClass)}>
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold opacity-80">
          {channelLabels[channel]}
        </p>
        {caption && (
          <p className="text-xs mt-0.5 opacity-85">
            {caption}
          </p>
        )}
      </div>

      {/* Brand info on the right — avatar + name + handle */}
      {(brandName || brandHandle || brandAvatar) && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
          {brandAvatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandAvatar}
              alt={brandName ?? brandHandle ?? "brand"}
              className="size-10 rounded-full object-cover border-2 border-white/80 shadow-sm"
              loading="lazy"
            />
          )}
          <div className={cn("text-right", overlayClass)}>
            {brandName && (
              <p className="text-sm font-semibold leading-tight drop-shadow-sm">
                {brandName}
              </p>
            )}
            {brandHandle && (
              <p className="text-[11px] opacity-85 leading-tight">
                {brandHandle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bottom gradient mask — softens the band edge into whatever
          card / content sits below, same trick as the YouTube card. */}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
    </div>
  );
}
