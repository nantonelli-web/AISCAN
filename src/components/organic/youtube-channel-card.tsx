"use client";

import {
  ExternalLink,
  Globe,
  MapPin,
  CheckCircle2,
  Users,
  Film,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitYoutubeChannel } from "@/types";

/**
 * YouTube channel snapshot card — the brand "business card" at the
 * top of the YouTube tab. Mirrors the SnapchatProfileCard layout so
 * the two organic-only channels feel consistent.
 */
export function YoutubeChannelCard({
  channel,
}: {
  channel: MaitYoutubeChannel;
}) {
  const { t } = useT();

  const counters: { key: string; icon: React.ComponentType<{ className?: string }>; label: string; value: number }[] = [
    { key: "subs", icon: Users, label: t("youtube", "subscriberCount"), value: channel.subscriber_count },
    { key: "videos", icon: Film, label: t("youtube", "totalVideos"), value: channel.total_videos },
    { key: "views", icon: Eye, label: t("youtube", "totalViews"), value: channel.total_views },
  ];

  return (
    <Card className="overflow-hidden">
      {/* Banner — fills full card width, gradient-mask-bottom so the
          identity row reads cleanly even on light banners. */}
      {channel.banner_url ? (
        <div className="relative aspect-[6/1] bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={channel.banner_url}
            alt={channel.channel_name ?? "YouTube banner"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        </div>
      ) : null}

      <CardContent className="p-6 space-y-5">
        {/* Header — avatar + identity */}
        <div className="flex items-start gap-4">
          {channel.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.avatar_url}
              alt={channel.channel_name ?? channel.channel_username ?? "channel"}
              className="size-16 rounded-full object-cover border border-border shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="size-16 rounded-full bg-muted border border-border shrink-0 grid place-items-center text-muted-foreground font-semibold text-xl">
              {(channel.channel_name ?? channel.channel_username ?? "?")
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold truncate">
                {channel.channel_name ?? channel.channel_username ?? "—"}
              </h3>
              {channel.is_verified && (
                <CheckCircle2 className="size-4 text-gold shrink-0" aria-label="verified" />
              )}
            </div>
            {channel.channel_username && (
              <p className="text-xs text-muted-foreground">@{channel.channel_username}</p>
            )}
            {channel.channel_joined_at && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("youtube", "joinedAt")} {formatDate(channel.channel_joined_at)}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        {channel.channel_description && (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {channel.channel_description}
          </p>
        )}

        {/* Counters */}
        <div className="grid gap-3 grid-cols-3">
          {counters.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-border bg-muted/30 p-3 text-center"
            >
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                <c.icon className="size-3" />
                <span className="text-[10px] uppercase tracking-wider">{c.label}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {formatNumber(c.value)}
              </p>
            </div>
          ))}
        </div>

        {/* Description links */}
        {channel.description_links && channel.description_links.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {channel.description_links
              .filter((l) => l.url)
              .slice(0, 6)
              .map((l) => (
                <a
                  key={l.url ?? l.text ?? Math.random().toString()}
                  href={l.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 hover:bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe className="size-3" />
                  {l.text ?? l.url?.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ))}
          </div>
        )}

        {/* Footer — location + scrape time + canonical link */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-3 border-t border-border">
          {channel.channel_location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {channel.channel_location}
            </span>
          )}
          <span className="ml-auto">
            {t("youtube", "scrapedAt")} {formatDate(channel.scraped_at)}
          </span>
          {channel.channel_url && (
            <a
              href={channel.channel_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              {t("organic", "viewOnYoutube")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
