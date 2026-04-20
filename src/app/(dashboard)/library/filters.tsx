"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { MetaIcon } from "@/components/ui/meta-icon";

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

export function LibraryFilters({
  initial,
  ctas,
  platforms,
  statuses,
  competitors,
}: {
  initial: Initial;
  ctas: string[];
  platforms: string[];
  statuses: string[];
  competitors: { id: string; page_name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { t } = useT();

  useEffect(() => { setQ(initial.q ?? ""); }, [initial.q]);

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    startTransition(() => { router.push(`/library?${next.toString()}`); });
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    update("q", q.trim() || null);
  }

  function clearAll() {
    setQ("");
    startTransition(() => router.push("/library"));
  }

  function clearChannel(ch?: string) {
    // When switching channel, clear secondary filters (they may not apply)
    const next = new URLSearchParams();
    if (ch) next.set("channel", ch);
    if (initial.brand) next.set("brand", initial.brand);
    if (initial.q) next.set("q", initial.q);
    startTransition(() => router.push(`/library?${next.toString()}`));
  }

  const hasFilters =
    initial.q || initial.platform || initial.cta || initial.status || initial.format || initial.channel || initial.brand;
  const advancedCount = [initial.format, initial.platform, initial.cta, initial.status].filter(Boolean).length;

  useEffect(() => { if (advancedCount > 0) setShowAdvanced(true); }, [advancedCount]);

  return (
    <div className="space-y-4">
      {/* ─── Row 1: Search ─── */}
      <form onSubmit={onSearch} className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("library", "searchPlaceholder")}
            className="pl-9 h-9"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {t("library", "searchBtn")}
        </Button>
      </form>

      {/* ─── Row 2: Primary filters ─── */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-6">
          {/* Channel — Paid */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Paid</span>
            <div className="flex items-center gap-1">
              <Pill active={(initial.channel ?? "") === ""} onClick={() => clearChannel()}>{t("library", "allChannels")}</Pill>
              <Pill active={initial.channel === "meta"} onClick={() => clearChannel("meta")}>
                <MetaIcon className="size-3" /> Meta
              </Pill>
              <Pill active={initial.channel === "google"} onClick={() => clearChannel("google")}>
                <GoogleIcon className="size-3" /> Google
              </Pill>
            </div>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Channel — Organic */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Organic</span>
            <Pill active={initial.channel === "instagram"} onClick={() => clearChannel("instagram")}>
              Instagram
            </Pill>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Brand</span>
            <select
              value={initial.brand ?? ""}
              onChange={(e) => update("brand", e.target.value || null)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold/40 bg-transparent",
                initial.brand
                  ? "border-gold/40 text-gold"
                  : "border-border text-muted-foreground"
              )}
            >
              <option value="">{t("library", "allBrands")}</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>{c.page_name}</option>
              ))}
            </select>
          </div>

          {/* Advanced toggle — hidden for Instagram (no ads filters) */}
          {initial.channel !== "instagram" && (
            <>
              <div className="h-5 w-px bg-border" />
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="size-3" />
                {t("library", "moreFilters")}
                {advancedCount > 0 && (
                  <span className="bg-gold/20 text-gold text-[9px] rounded-full px-1.5 min-w-[16px] text-center">{advancedCount}</span>
                )}
                <ChevronDown className={cn("size-3 transition-transform", showAdvanced && "rotate-180")} />
              </button>
            </>
          )}

          {/* Reset */}
          {hasFilters && (
            <>
              <div className="h-5 w-px bg-border" />
              <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors cursor-pointer">
                <X className="size-3" /> Reset
              </button>
            </>
          )}
        </div>

        {/* ─── Advanced filters (expandable, hidden for Instagram) ─── */}
        {showAdvanced && initial.channel !== "instagram" && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-6">
            <FilterSelect
              label={t("library", "formatLabel")}
              options={[
                { value: "image", label: t("library", "formatImage") },
                { value: "video", label: t("library", "formatVideo") },
              ]}
              value={initial.format}
              onChange={(v) => update("format", v)}
            />
            {platforms.length > 0 && (
              <FilterSelect
                label={t("library", "platformLabel")}
                options={platforms.map((p) => ({ value: p, label: p }))}
                value={initial.platform}
                onChange={(v) => update("platform", v)}
              />
            )}
            {ctas.length > 0 && (
              <FilterSelect
                label={t("library", "ctaLabel")}
                options={ctas.slice(0, 12).map((c) => ({ value: c, label: c }))}
                value={initial.cta}
                onChange={(v) => update("cta", v)}
              />
            )}
            {statuses.length > 0 && (
              <FilterSelect
                label={t("library", "statusLabel")}
                options={statuses.map((s) => ({ value: s, label: s }))}
                value={initial.status}
                onChange={(v) => update("status", v)}
              />
            )}
          </div>
        )}
      </div>

      {/* ─── Active filter tags ─── */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5">
          {initial.q && <Tag label={`"${initial.q}"`} onRemove={() => { setQ(""); update("q", null); }} />}
          {initial.channel && <Tag label={initial.channel === "meta" ? "Meta Ads" : "Google Ads"} onRemove={() => update("channel", null)} />}
          {initial.brand && <Tag label={competitors.find((c) => c.id === initial.brand)?.page_name ?? "Brand"} onRemove={() => update("brand", null)} />}
          {initial.format && <Tag label={initial.format} onRemove={() => update("format", null)} />}
          {initial.platform && <Tag label={initial.platform} onRemove={() => update("platform", null)} />}
          {initial.cta && <Tag label={initial.cta} onRemove={() => update("cta", null)} />}
          {initial.status && <Tag label={initial.status} onRemove={() => update("status", null)} />}
        </div>
      )}
    </div>
  );
}

/* ─── Pill button ─── */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
        active
          ? "bg-gold text-gold-foreground font-medium"
          : "text-muted-foreground hover:bg-gold hover:text-gold-foreground"
      )}
    >
      {children}
    </button>
  );
}

/* ─── Filter select ─── */
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
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold/40 bg-transparent",
          value ? "border-gold/40 text-gold" : "border-border text-muted-foreground"
        )}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── Removable tag ─── */
function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 border border-gold/20 px-2.5 py-0.5 text-[10px] text-gold">
      {label}
      <button onClick={onRemove} className="hover:text-foreground transition-colors cursor-pointer"><X className="size-2.5" /></button>
    </span>
  );
}
