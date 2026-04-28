"use client";

import {
  ExternalLink,
  Globe,
  MapPin,
  CheckCircle2,
  Sparkles,
  Image as ImageIcon,
  Film,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitSnapchatProfile } from "@/types";

/**
 * Snapchat is fundamentally different from TikTok / Instagram: there
 * is no per-post entity to render, just a profile snapshot. This card
 * is the "brand business card" for Snapchat — counters, presence
 * flags, bio + assets — and lives at the top of the Snapchat tab.
 */
export function SnapchatProfileCard({ profile }: { profile: MaitSnapchatProfile }) {
  const { t } = useT();

  const presence: { key: string; label: string; active: boolean }[] = [
    { key: "story", label: t("snapchat", "hasStory"), active: profile.has_story },
    {
      key: "highlights",
      label: t("snapchat", "hasHighlights"),
      active: profile.has_curated_highlights,
    },
    {
      key: "spotlights",
      label: t("snapchat", "hasSpotlights"),
      active: profile.has_spotlight_highlights,
    },
  ];

  const counters: { key: string; icon: React.ComponentType<{ className?: string }>; label: string; value: number }[] = [
    { key: "spotlights", icon: Film, label: t("snapchat", "spotlightCount"), value: profile.spotlight_count },
    { key: "highlights", icon: ImageIcon, label: t("snapchat", "highlightCount"), value: profile.highlight_count },
    { key: "lenses", icon: Wand2, label: t("snapchat", "lensCount"), value: profile.lens_count },
    { key: "subs", icon: Sparkles, label: t("snapchat", "subscriberCount"), value: profile.subscriber_count },
  ];

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Header — avatar + identity + verified */}
        <div className="flex items-start gap-4">
          {profile.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profile_picture_url}
              alt={profile.display_name ?? profile.username}
              className="size-16 rounded-full object-cover border border-border shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="size-16 rounded-full bg-muted border border-border shrink-0 grid place-items-center text-muted-foreground font-semibold text-xl">
              {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold truncate">
                {profile.display_name ?? profile.username}
              </h3>
              {profile.is_verified && (
                <CheckCircle2 className="size-4 text-gold shrink-0" aria-label="verified" />
              )}
              {profile.profile_type && profile.profile_type !== "public" && (
                <Badge variant="outline" className="text-[10px]">
                  {profile.profile_type}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">@{profile.username}</p>
            {profile.category && (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{profile.category}</span>
                {profile.subcategory && (
                  <>
                    <span>·</span>
                    <span>{profile.subcategory}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {profile.snapcode_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.snapcode_image_url}
              alt="Snapcode"
              className="size-16 shrink-0 rounded-md bg-yellow-300 p-1"
              loading="lazy"
            />
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        )}

        {/* Counters grid */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
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

        {/* Presence pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {presence.map((p) => (
            <span
              key={p.key}
              className={
                p.active
                  ? "inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-1 text-xs font-medium"
                  : "inline-flex items-center gap-1 rounded-md bg-muted text-muted-foreground border border-border px-2 py-1 text-xs"
              }
            >
              <span
                className={
                  p.active
                    ? "size-1.5 rounded-full bg-gold"
                    : "size-1.5 rounded-full bg-muted-foreground/40"
                }
              />
              {p.label}
            </span>
          ))}
        </div>

        {/* Footer — links + scrape time */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-3 border-t border-border">
          {profile.website_url && (
            <a
              href={profile.website_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              <Globe className="size-3" />
              {profile.website_url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {profile.address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {profile.address}
            </span>
          )}
          <span className="ml-auto">
            {t("snapchat", "scrapedAt")} {formatDate(profile.scraped_at)}
          </span>
          {profile.profile_url && (
            <a
              href={profile.profile_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              {t("organic", "viewOnSnapchat")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
