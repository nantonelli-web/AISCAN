"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  Check,
  Tv2,
  Building2,
  Filter as FilterIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";

interface Initial {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

type Facets = { ctas: string[]; platforms: string[]; statuses: string[] };

function isOrganicChannel(channel: string | undefined): boolean {
  return (
    channel === "instagram" ||
    channel === "tiktok" ||
    channel === "snapchat" ||
    channel === "youtube"
  );
}

/**
 * Library filters — redesigned 2026-05-04 after the user
 * flagged the previous compressed-row layout for the third
 * time. The new structure follows the UI hierarchy memo
 * (`feedback_ui_hierarchy_guidelines.md`):
 *
 *   • Search lives in its own card so it reads as a top-level
 *     action, not as one option among many in a filter strip.
 *   • Channel picker is a card with a clear "Canale" heading
 *     and a paid/organic split inside a single visually
 *     distinct row, big pills, gold-solid active state.
 *   • Brand + advanced filters card frames the secondary
 *     refinements; the advanced panel slides open inside the
 *     same card instead of expanding into a sibling row.
 *   • Active filter chips (the recap row) sit above all of
 *     this with a subtle "Filtri attivi:" eyebrow so the user
 *     understands what the chips represent.
 */
export function LibraryFilters({
  initial,
  competitors,
}: {
  initial: Initial;
  competitors: { id: string; page_name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const { t } = useT();

  const [filters, setFilters] = useState<Initial>(initial);
  useEffect(() => {
    setFilters(initial);
    setQ(initial.q ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial.q,
    initial.channel,
    initial.brand,
    initial.format,
    initial.platform,
    initial.cta,
    initial.status,
  ]);

  function navigate(next: URLSearchParams) {
    startTransition(() => {
      router.push(next.toString() ? `/library?${next.toString()}` : "/library");
    });
  }

  function update(key: keyof Initial, value: string | null) {
    setFilters((s) => ({ ...s, [key]: value ?? undefined }));
    const next = new URLSearchParams(params.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    navigate(next);
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    update("q", q.trim() || null);
  }

  function clearAll() {
    setFilters({});
    setQ("");
    navigate(new URLSearchParams());
  }

  function selectChannel(ch?: string) {
    setFilters({
      channel: ch,
      brand: filters.brand,
      q: filters.q,
    });
    const next = new URLSearchParams();
    if (ch) next.set("channel", ch);
    if (filters.brand) next.set("brand", filters.brand);
    if (filters.q) next.set("q", filters.q);
    navigate(next);
  }

  const hasFilters = Boolean(
    filters.q ||
      filters.platform ||
      filters.cta ||
      filters.status ||
      filters.format ||
      filters.channel ||
      filters.brand,
  );
  const advancedCount = [
    filters.format,
    filters.platform,
    filters.cta,
    filters.status,
  ].filter(Boolean).length;

  useEffect(() => {
    if (advancedCount > 0) setShowAdvanced(true);
  }, [advancedCount]);

  useEffect(() => {
    if (!showAdvanced || facets || facetsLoading) return;
    setFacetsLoading(true);
    fetch("/api/library/facets")
      .then((r) => (r.ok ? r.json() : { ctas: [], platforms: [], statuses: [] }))
      .then((data: Facets) => setFacets(data))
      .catch(() => setFacets({ ctas: [], platforms: [], statuses: [] }))
      .finally(() => setFacetsLoading(false));
  }, [showAdvanced, facets, facetsLoading]);

  const channelLabels: Record<string, string> = {
    meta: "Meta Ads",
    google: "Google Ads",
    instagram: "Instagram",
    tiktok: "TikTok",
    snapchat: "Snapchat",
    youtube: "YouTube",
  };

  return (
    <div className="space-y-4">
      {/* ─── Search card ──────────────────────────────────
          Promoted to its own card with a real heading so the
          input doesn't compete visually with the smaller filter
          pills below. */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={onSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("library", "searchPlaceholder")}
                className="pl-9 h-10 text-sm"
              />
            </div>
            <Button type="submit" size="default">
              <Search className="size-4 mr-1" />
              {t("library", "searchBtn")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Channel card — primary pivot ─────────────────
          Channel determines the entire shape of the page
          (which table is queried, which card component
          renders) so it gets the most prominent block. Big
          pills, gold-solid active state, paid/organic split
          with a clear vertical divider. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="inline-flex items-center gap-2 text-sm">
            <Tv2 className="size-4 text-muted-foreground" />
            {t("library", "channelHeading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Paid
              </span>
              <BigPill
                active={!filters.channel}
                onClick={() => selectChannel()}
              >
                {t("library", "allChannels")}
              </BigPill>
              <BigPill
                active={filters.channel === "meta"}
                onClick={() => selectChannel("meta")}
              >
                <MetaIcon className="size-3.5" /> Meta
              </BigPill>
              <BigPill
                active={filters.channel === "google"}
                onClick={() => selectChannel("google")}
              >
                <GoogleIcon className="size-3.5" /> Google
              </BigPill>
            </div>
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Organic
              </span>
              <BigPill
                active={filters.channel === "instagram"}
                onClick={() => selectChannel("instagram")}
              >
                <InstagramIcon className="size-3.5" /> Instagram
              </BigPill>
              <BigPill
                active={filters.channel === "tiktok"}
                onClick={() => selectChannel("tiktok")}
              >
                <TikTokIcon className="size-3.5" /> TikTok
              </BigPill>
              <BigPill
                active={filters.channel === "snapchat"}
                onClick={() => selectChannel("snapchat")}
              >
                <SnapchatIcon className="size-3.5" /> Snapchat
              </BigPill>
              <BigPill
                active={filters.channel === "youtube"}
                onClick={() => selectChannel("youtube")}
              >
                <YouTubeIcon className="size-3.5" /> YouTube
              </BigPill>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Refinements card — brand + advanced ──────────
          Brand selector is the primary refinement (covers all
          channels). Advanced filters apply only to paid
          surfaces, so the toggle is hidden when an organic
          channel is selected. */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="inline-flex items-center gap-2 text-sm">
            <FilterIcon className="size-4 text-muted-foreground" />
            {t("library", "refinementsHeading")}
          </CardTitle>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
            >
              <X className="size-3" />
              {t("library", "resetFilters")}
            </button>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <Building2 className="size-3" /> Brand
              </span>
              <select
                value={filters.brand ?? ""}
                onChange={(e) => update("brand", e.target.value || null)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/30 bg-background min-w-[180px]",
                  filters.brand
                    ? "border-gold text-gold font-medium"
                    : "border-border text-foreground",
                )}
              >
                <option value="">{t("library", "allBrands")}</option>
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.page_name}
                  </option>
                ))}
              </select>
            </div>

            {!isOrganicChannel(filters.channel) && (
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer",
                  showAdvanced
                    ? "border-gold/40 bg-gold/5 text-gold"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                {t("library", "moreFilters")}
                {advancedCount > 0 && (
                  <span className="bg-gold text-gold-foreground text-[10px] font-semibold rounded-full px-1.5 min-w-[18px] text-center tabular-nums">
                    {advancedCount}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    showAdvanced && "rotate-180",
                  )}
                />
              </button>
            )}
          </div>

          {showAdvanced && !isOrganicChannel(filters.channel) && (
            <div className="pt-3 border-t border-border flex flex-wrap gap-x-6 gap-y-3">
              <FilterSelect
                label={t("library", "formatLabel")}
                options={[
                  { value: "image", label: t("library", "formatImage") },
                  { value: "video", label: t("library", "formatVideo") },
                ]}
                value={filters.format}
                onChange={(v) => update("format", v)}
              />
              {facetsLoading && !facets ? (
                <span className="text-xs text-muted-foreground self-center">
                  …
                </span>
              ) : facets ? (
                <>
                  {facets.platforms.length > 0 && (
                    <FilterSelect
                      label={t("library", "platformLabel")}
                      options={facets.platforms.map((p) => ({
                        value: p,
                        label: p,
                      }))}
                      value={filters.platform}
                      onChange={(v) => update("platform", v)}
                    />
                  )}
                  {facets.ctas.length > 0 && (
                    <FilterSelect
                      label={t("library", "ctaLabel")}
                      options={facets.ctas
                        .slice(0, 12)
                        .map((c) => ({ value: c, label: c }))}
                      value={filters.cta}
                      onChange={(v) => update("cta", v)}
                    />
                  )}
                  {facets.statuses.length > 0 && (
                    <FilterSelect
                      label={t("library", "statusLabel")}
                      options={facets.statuses.map((s) => ({
                        value: s,
                        label: s,
                      }))}
                      value={filters.status}
                      onChange={(v) => update("status", v)}
                    />
                  )}
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active filters recap — shows what's currently applied
          so the user can dismiss individual filters without
          having to remember which control they came from. */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("library", "activeFilters")}:
          </span>
          {filters.q && (
            <Tag
              label={`"${filters.q}"`}
              onRemove={() => {
                setQ("");
                update("q", null);
              }}
            />
          )}
          {filters.channel && (
            <Tag
              label={channelLabels[filters.channel] ?? filters.channel}
              onRemove={() => selectChannel()}
            />
          )}
          {filters.brand && (
            <Tag
              label={
                competitors.find((c) => c.id === filters.brand)?.page_name ??
                "Brand"
              }
              onRemove={() => update("brand", null)}
            />
          )}
          {filters.format && (
            <Tag
              label={filters.format}
              onRemove={() => update("format", null)}
            />
          )}
          {filters.platform && (
            <Tag
              label={filters.platform}
              onRemove={() => update("platform", null)}
            />
          )}
          {filters.cta && (
            <Tag label={filters.cta} onRemove={() => update("cta", null)} />
          )}
          {filters.status && (
            <Tag
              label={filters.status}
              onRemove={() => update("status", null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Pill button — bumped from the cramped px-2.5/py-1 size to
 *  px-3/py-1.5 for genuine clickability + readability. Selected
 *  state is solid gold (was gold-soft) so the active-vs-idle
 *  distinction is unmissable on bg-card. */
function BigPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors cursor-pointer border",
        active
          ? "bg-gold text-gold-foreground border-gold font-medium"
          : "border-border text-foreground hover:bg-muted",
      )}
    >
      {active && <Check className="size-3" />}
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "rounded-md border px-3 py-1.5 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/30 bg-background min-w-[140px]",
          value
            ? "border-gold text-gold font-medium"
            : "border-border text-foreground",
        )}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 border border-gold/30 px-3 py-1 text-xs text-gold font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:text-foreground transition-colors cursor-pointer"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
