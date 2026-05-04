"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import {
  Search,
  X,
  Check,
  Tv2,
  Filter as FilterIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import type { MaitClient } from "@/types";

interface Initial {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
  client?: string;
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
 * Library filters — 2026-05-04 second iteration. User feedback:
 *   1) add a "Progetto" filter alongside Brand
 *   2) drop the "Filtri avanzati" toggle, show advanced fields
 *      always open
 *   3) add a "Tutti" pill in the Organic group too
 *   4) result count drops the "(max 120)" qualifier
 *   5) (cards) crossed-out play placeholder for missing video
 *   6) clearing the search input must restore the unfiltered list
 *      (current bug: empty input keeps the URL param)
 *   7) search box must NOT take a top-level Card; demote it
 *      inside the Filtri row
 *
 * Layout now:
 *   • Channel card with Paid + Organic groups, both featuring
 *     a "Tutti" pill.
 *   • Filtri card containing — on one row:
 *       Progetto select, Brand select (cascades on project),
 *       a small inline search input with X clear button.
 *     Then below the row, the format / platform / cta / status
 *     selects always visible (no collapse). Reset link top-right.
 *   • Active-filter chips below.
 */
export function LibraryFilters({
  initial,
  competitors,
  clients,
}: {
  initial: Initial;
  competitors: { id: string; page_name: string; client_id: string | null }[];
  clients: MaitClient[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
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
    initial.client,
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

  // Project change cascades on Brand: if the chosen brand is no
  // longer inside the new project, clear the brand filter.
  function selectClient(clientId: string | null) {
    const nextBrandStillValid =
      !filters.brand ||
      (clientId === null
        ? true
        : clientId === "unassigned"
          ? competitors.find((c) => c.id === filters.brand)?.client_id === null
          : competitors.find((c) => c.id === filters.brand)?.client_id === clientId);
    setFilters((s) => ({
      ...s,
      client: clientId ?? undefined,
      brand: nextBrandStillValid ? s.brand : undefined,
    }));
    const next = new URLSearchParams(params.toString());
    if (clientId) next.set("client", clientId);
    else next.delete("client");
    if (!nextBrandStillValid) next.delete("brand");
    navigate(next);
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    update("q", q.trim() || null);
  }

  // X-button clear: empties the input AND fires the search so
  // the URL param disappears immediately. Without this the user
  // had to clear the input + hit Enter to see all results back
  // (bug flagged 2026-05-04: "una volta pulito il campo non si
  // visualizza più alcun contenuto" — fixed here).
  function clearSearch() {
    setQ("");
    update("q", null);
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
      client: filters.client,
      q: filters.q,
    });
    const next = new URLSearchParams();
    if (ch) next.set("channel", ch);
    if (filters.brand) next.set("brand", filters.brand);
    if (filters.client) next.set("client", filters.client);
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
      filters.brand ||
      filters.client,
  );

  // Facets are always shown now — fetch eagerly. The /library/facets
  // route is small (CTAs + platforms + statuses, capped at 500 rows)
  // and almost always cached, so eager fetch is fine.
  useEffect(() => {
    if (facets || facetsLoading) return;
    setFacetsLoading(true);
    fetch("/api/library/facets")
      .then((r) => (r.ok ? r.json() : { ctas: [], platforms: [], statuses: [] }))
      .then((data: Facets) => setFacets(data))
      .catch(() => setFacets({ ctas: [], platforms: [], statuses: [] }))
      .finally(() => setFacetsLoading(false));
  }, [facets, facetsLoading]);

  // Brands cascading on project: when a project is selected,
  // restrict the brand dropdown to that project's brands.
  const brandOptions = filters.client
    ? competitors.filter((c) =>
        filters.client === "unassigned"
          ? c.client_id === null
          : c.client_id === filters.client,
      )
    : competitors;

  const channelLabels: Record<string, string> = {
    meta: "Meta Ads",
    google: "Google Ads",
    instagram: "Instagram",
    tiktok: "TikTok",
    snapchat: "Snapchat",
    youtube: "YouTube",
  };
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const hasUnassigned = competitors.some((c) => c.client_id === null);

  return (
    <div className="space-y-4">
      {/* ─── Channel card — primary pivot ─────────────────
          Paid + Organic groups, BOTH featuring a "Tutti" pill
          (user request 2026-05-04). The two "Tutti" pills both
          clear the channel filter — they're synonymous, just
          ergonomic shortcuts that match where the user's mouse
          already is when scanning either group. */}
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
              {/* Same "Tutti" affordance duplicated in the Organic
                  group per user request — clears the channel filter,
                  identical behaviour to the Paid-side "Tutti". */}
              <BigPill
                active={!filters.channel}
                onClick={() => selectChannel()}
              >
                {t("library", "allChannels")}
              </BigPill>
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

      {/* ─── Refinements card — Project + Brand + inline Search
          + always-visible advanced filters ─────────────── */}
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
          {/* Top row: Progetto, Brand, inline Search */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("library", "filterByProject")}
              </span>
              <select
                value={filters.client ?? ""}
                onChange={(e) => selectClient(e.target.value || null)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/30 bg-background min-w-[170px]",
                  filters.client
                    ? "border-gold text-gold font-medium"
                    : "border-border text-foreground",
                )}
              >
                <option value="">{t("library", "allProjects")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {hasUnassigned && (
                  <option value="unassigned">
                    {t("clients", "unassigned")}
                  </option>
                )}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Brand
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
                {brandOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.page_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Inline search — demoted from a top-level card to a
                small auxiliary input inside the Filtri card. The
                X button clears value + URL in one click so the bug
                where an emptied input still kept the q param is
                impossible to hit. */}
            <form onSubmit={onSearch} className="relative flex-1 min-w-[220px]">
              <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("library", "searchPlaceholder")}
                aria-label={t("library", "searchPlaceholder")}
                className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
              {q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label={t("library", "clearSearch")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </form>
          </div>

          {/* Advanced filters — always visible (toggle removed
              2026-05-04 per user request). Hidden only when the
              selected channel is organic (those tables don't
              carry these facets). */}
          {!isOrganicChannel(filters.channel) && (
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

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("library", "activeFilters")}:
          </span>
          {filters.q && (
            <Tag
              label={`"${filters.q}"`}
              onRemove={clearSearch}
            />
          )}
          {filters.channel && (
            <Tag
              label={channelLabels[filters.channel] ?? filters.channel}
              onRemove={() => selectChannel()}
            />
          )}
          {filters.client && (
            <Tag
              label={
                filters.client === "unassigned"
                  ? t("clients", "unassigned")
                  : clientNameById.get(filters.client) ?? "Project"
              }
              onRemove={() => selectClient(null)}
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
