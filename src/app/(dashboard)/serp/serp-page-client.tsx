"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Trash2,
  Search,
  Globe,
  Megaphone,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { cn, formatDate } from "@/lib/utils";
import { getCountries } from "@/config/countries";

interface BrandRef {
  id: string;
  page_name: string;
  google_domain: string | null;
}

interface QueryRunSummary {
  id: string;
  scraped_at: string;
  organic_count: number;
  paid_count: number;
  paid_products_count: number;
  has_ai_overview: boolean;
}

interface QueryWithRuns {
  id: string;
  query: string;
  country: string;
  language: string;
  device: string;
  label: string | null;
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string;
  // Supabase types the embedded relation as either object or array
  // depending on the version — accept both shapes.
  brands: {
    competitor_id: string;
    mait_competitors: BrandRef | BrandRef[] | null;
  }[];
  runs: QueryRunSummary[];
}

interface Props {
  initialQueries: QueryWithRuns[];
  competitors: BrandRef[];
}

const COMMON_LANGUAGES = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
];

const COMMON_COUNTRIES = ["IT", "FR", "DE", "ES", "GB", "US", "PT", "NL"];

export function SerpPageClient({ initialQueries, competitors }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useT();
  const allCountries = getCountries(locale);

  // URL-driven hooks for the bidirectional brand-first vs
  // workspace-first flow:
  //   ?brandId=X  → pre-attach the brand on the create form. Set
  //                 by the brand-detail SERP tab when the user
  //                 clicks "New query for this brand".
  //   ?new=1      → force the create form open even when other
  //                 queries already exist (otherwise the form
  //                 only auto-opens on empty state).
  //   ?brand=X    → top-level filter chip — narrows the query list
  //                 to those linked to brand X. Distinct from
  //                 brandId because filter ≠ pre-attach on create.
  const preselectBrandId = searchParams.get("brandId");
  const forceShowForm = searchParams.get("new") === "1";
  const filterBrandId = searchParams.get("brand");

  const [queries, setQueries] = useState<QueryWithRuns[]>(initialQueries);
  // Re-sync from server prop after router.refresh() so a newly
  // created query becomes visible without forcing a hard reload.
  // Same fix as Maps page — symptom was "Query Created" toast
  // followed by no row in the list.
  useEffect(() => {
    setQueries(initialQueries);
  }, [initialQueries]);
  const [showForm, setShowForm] = useState(
    initialQueries.length === 0 || forceShowForm || !!preselectBrandId,
  );

  // Form state
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("IT");
  const [language, setLanguage] = useState("it");
  const [device, setDevice] = useState<"DESKTOP" | "MOBILE">("DESKTOP");
  const [label, setLabel] = useState("");
  const [linkedBrandIds, setLinkedBrandIds] = useState<string[]>(
    preselectBrandId ? [preselectBrandId] : [],
  );
  const [creating, setCreating] = useState(false);

  // Per-row scan/delete state
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleBrand(id: string) {
    setLinkedBrandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function resetForm() {
    setQuery("");
    setCountry("IT");
    setLanguage("it");
    setDevice("DESKTOP");
    setLabel("");
    setLinkedBrandIds([]);
  }

  async function createQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/serp/queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          country,
          language,
          device,
          label: label.trim() || null,
          competitor_ids: linkedBrandIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("serp", "createError"));
        return;
      }
      toast.success(t("serp", "createOk"));
      resetForm();
      setShowForm(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function scanQuery(id: string) {
    setScanningId(id);
    const toastId = toast.loading(t("serp", "scanning"));
    try {
      const res = await fetch("/api/serp/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query_id: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("serp", "scanError"), { id: toastId });
        return;
      }
      toast.success(
        `${json.organic_count} ${t("serp", "organicResults")} · ${json.paid_count} ${t("serp", "paidResults")}`,
        { id: toastId },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
    } finally {
      setScanningId(null);
    }
  }

  async function deleteQuery(id: string) {
    if (!confirm(t("serp", "deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/serp/queries/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? t("serp", "deleteError"));
        return;
      }
      setQueries((prev) => prev.filter((q) => q.id !== id));
      toast.success(t("serp", "deleted"));
    } finally {
      setDeletingId(null);
    }
  }

  // Sort countries: common ones first, then alphabetical.
  const sortedCountries = [
    ...COMMON_COUNTRIES.map((code) =>
      allCountries.find((c) => c.code === code),
    ).filter((c): c is { code: string; name: string } => !!c),
    ...allCountries
      .filter((c) => !COMMON_COUNTRIES.includes(c.code))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // Brand filter for the bidirectional flow — when the user lands
  // here from /serp?brand=ID we narrow the displayed queries to
  // those linked to that brand. Filtering is purely client-side
  // because the M:N junction is already loaded; no extra fetch.
  const filteredBrand = filterBrandId
    ? competitors.find((c) => c.id === filterBrandId)
    : null;
  const displayedQueries = filterBrandId
    ? queries.filter((q) =>
        q.brands.some((b) => b.competitor_id === filterBrandId),
      )
    : queries;

  function clearBrandFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("brand");
    const next = params.toString();
    router.replace(`/serp${next ? `?${next}` : ""}`);
  }

  return (
    <div className="space-y-5">
      {/* ─── Brand filter chip — shown only when filtering is active.
              Same UX pattern as the Benchmarks country chip: visible
              chip with brand name + clear button. */}
      {filteredBrand && (
        <div className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2">
          <span className="text-xs uppercase tracking-wider text-gold">
            {t("serp", "filteringBy")}
          </span>
          <Badge variant="gold">{filteredBrand.page_name}</Badge>
          <button
            onClick={clearBrandFilter}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t("serp", "clearFilter")}
          </button>
        </div>
      )}

      {/* ─── Add-query toggle / form ───────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {displayedQueries.length}{" "}
          {displayedQueries.length === 1
            ? t("serp", "querySingular")
            : t("serp", "queryPlural")}
        </p>
        <Button onClick={() => setShowForm((s) => !s)} variant="outline" className="gap-2">
          <Plus className="size-4" />
          {showForm ? t("serp", "closeForm") : t("serp", "addQuery")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={createQuery} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="serpQuery">{t("serp", "queryLabel")}</Label>
                  <Input
                    id="serpQuery"
                    required
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("serp", "queryPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serpCountry">{t("serp", "countryLabel")}</Label>
                  <select
                    id="serpCountry"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {sortedCountries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-card">
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serpLanguage">{t("serp", "languageLabel")}</Label>
                  <select
                    id="serpLanguage"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {COMMON_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code} className="bg-card">
                        {l.code} — {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("serp", "deviceLabel")}</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDevice("DESKTOP")}
                      className={cn(
                        "flex-1 px-3 py-2 text-xs rounded-md border transition-colors cursor-pointer",
                        device === "DESKTOP"
                          ? "bg-gold/15 text-gold border-gold/30"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t("serp", "deviceDesktop")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDevice("MOBILE")}
                      className={cn(
                        "flex-1 px-3 py-2 text-xs rounded-md border transition-colors cursor-pointer",
                        device === "MOBILE"
                          ? "bg-gold/15 text-gold border-gold/30"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t("serp", "deviceMobile")}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serpLabel">{t("serp", "labelLabel")}</Label>
                  <Input
                    id="serpLabel"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("serp", "labelPlaceholder")}
                  />
                </div>
                {competitors.length > 0 && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("serp", "linkBrandsLabel")}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t("serp", "linkBrandsHint")}
                    </p>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 grid grid-cols-2 gap-1">
                      {competitors.map((c) => {
                        const selected = linkedBrandIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleBrand(c.id)}
                            className={cn(
                              "flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                              selected
                                ? "bg-gold/15 text-gold border border-gold/30"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <span className="truncate">{c.page_name}</span>
                            {c.google_domain && (
                              <span className="text-[10px] text-muted-foreground/70 truncate">
                                {c.google_domain}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={creating || !query.trim()}>
                  {creating ? t("serp", "creating") : t("serp", "createSubmit")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── Queries grid ──────────────────────────────────────── */}
      {displayedQueries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {filterBrandId
              ? t("serp", "noQueriesForBrand")
              : t("serp", "noQueriesYet")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedQueries.map((q) => {
            const latest = q.runs[0];
            const isScanning = scanningId === q.id;
            const isDeleting = deletingId === q.id;
            const linkedBrands = q.brands
              .map((b) => {
                const c = b.mait_competitors;
                if (!c) return null;
                return Array.isArray(c) ? c[0] ?? null : c;
              })
              .filter((c): c is BrandRef => !!c);
            return (
              <Card
                key={q.id}
                role="link"
                tabIndex={0}
                aria-label={`${t("serp", "openDetailFor")}: ${q.query}`}
                onClick={() => router.push(`/serp/${q.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/serp/${q.id}`);
                  }
                }}
                className="hover:border-gold/40 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-4">
                    <Search className="size-5 text-gold shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {/* Title kept styled as a hyperlink so the eye
                          still reads it as the primary action, but the
                          whole card is the actual target — Link
                          replaced with a span to avoid nested
                          interactive elements (the parent Card is
                          role=link). */}
                      <span className="text-base font-medium hover:text-gold transition-colors break-words">
                        {q.query}
                      </span>
                      {q.label && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {q.label}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          <Globe className="size-3 mr-1" />
                          {q.country}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {q.language}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {q.device}
                        </Badge>
                        {linkedBrands.map((b) => (
                          <Badge key={b.id} variant="gold" className="text-[10px]">
                            {b.page_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {/* stopPropagation on the action buttons keeps the
                        whole-card navigation pattern from triggering
                        when the user clicks Scan or Delete. Without
                        it, Scan would fire AND the page would navigate
                        away to the detail mid-scan. */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          scanQuery(q.id);
                        }}
                        disabled={isScanning || isDeleting}
                        className="gap-1.5"
                      >
                        {isScanning ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        {isScanning ? t("serp", "scanningShort") : t("serp", "scanAction")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuery(q.id);
                        }}
                        disabled={isScanning || isDeleting}
                        className="size-8 p-0 text-muted-foreground hover:text-red-400"
                      >
                        {isDeleting ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Latest run summary */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                    {latest ? (
                      <>
                        <span className="flex items-center gap-1">
                          <Search className="size-3" />
                          <b className="text-foreground tabular-nums">{latest.organic_count}</b>{" "}
                          {t("serp", "organicResults")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Megaphone className="size-3" />
                          <b className="text-foreground tabular-nums">{latest.paid_count}</b>{" "}
                          {t("serp", "paidResults")}
                        </span>
                        {latest.paid_products_count > 0 && (
                          <span className="flex items-center gap-1">
                            <ShoppingBag className="size-3" />
                            <b className="text-foreground tabular-nums">{latest.paid_products_count}</b>{" "}
                            {t("serp", "paidProducts")}
                          </span>
                        )}
                        {latest.has_ai_overview && (
                          <span className="flex items-center gap-1 text-gold">
                            <Sparkles className="size-3" />
                            {t("serp", "aiOverview")}
                          </span>
                        )}
                        <span className="ml-auto">
                          {t("serp", "lastScraped")} {formatDate(latest.scraped_at)}
                        </span>
                      </>
                    ) : (
                      <span className="italic">{t("serp", "neverScraped")}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

