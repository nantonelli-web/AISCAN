"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus, Sparkles, Loader2, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { DiscoveryResult } from "@/lib/discovery/website-scraper";

import { getCountries } from "@/config/countries";

const CATEGORIES = [
  "Fashion",
  "Luxury",
  "E-Commerce",
  "Beauty & Cosmetics",
  "Fitness & Sport",
  "Food & Beverage",
  "Travel & Hospitality",
  "Real Estate",
  "Automotive",
  "Finance & Insurance",
  "Healthcare",
  "Education",
  "SaaS & Technology",
  "Entertainment & Media",
  "Home & Furniture",
  "Jewelry & Watches",
  "Kids & Baby",
  "Pets",
  "Gaming",
  "Non-Profit",
];

interface ClientOption {
  id: string;
  name: string;
  color: string;
}

export function NewCompetitorForm() {
  const router = useRouter();
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [snapchatHandle, setSnapchatHandle] = useState("");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");
  const [googleAdvertiserId, setGoogleAdvertiserId] = useState("");
  const [googleDomain, setGoogleDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // ── Brand auto-discovery (Strategy A) ────────────────────────
  // The discovery flow: user types a domain in the dedicated input,
  // hits "Auto-fill", we hit /api/brand-discovery, then show a
  // confirmation dialog with every found field pre-checked. Only
  // the user-confirmed fields get applied to the form, so a wrong-
  // positive on (e.g.) Snapchat doesn't pollute the saved record.
  const [discoveryDomain, setDiscoveryDomain] = useState("");
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discoveryPicked, setDiscoveryPicked] = useState<Record<string, boolean>>({});

  async function runDiscovery() {
    if (!discoveryDomain.trim()) return;
    setDiscoveryRunning(true);
    setDiscovery(null);
    try {
      const res = await fetch("/api/brand-discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: discoveryDomain.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Discovery failed");
        return;
      }
      const d = json as DiscoveryResult;
      setDiscovery(d);
      // Pre-check every field whose confidence ≥ 50 — those are
      // strong matches the user will almost always accept. Lower-
      // confidence fields show in the dialog but unchecked, so the
      // user opts in actively.
      setDiscoveryPicked({
        page_name: d.page_name.confidence >= 50,
        page_url: d.page_url.confidence >= 50,
        instagram_username: d.instagram_username.confidence >= 50,
        tiktok_username: d.tiktok_username.confidence >= 50,
        youtube_channel_url: d.youtube_channel_url.confidence >= 50,
        snapchat_handle: d.snapchat_handle.confidence >= 50,
        google_domain: d.google_domain.confidence >= 50,
        category: d.category.confidence >= 50,
        country: d.country.confidence >= 50,
      });
      if (!d.fetched) {
        toast.warning(t("newCompetitor", "discoveryNoFetch"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscoveryRunning(false);
    }
  }

  function applyDiscovery() {
    if (!discovery) return;
    const d = discovery;
    if (discoveryPicked.page_name && d.page_name.value) {
      setPageName(d.page_name.value);
    }
    if (discoveryPicked.page_url && d.page_url.value) {
      setPageUrl(d.page_url.value);
    }
    if (discoveryPicked.instagram_username && d.instagram_username.value) {
      setInstagramUsername(d.instagram_username.value);
    }
    if (discoveryPicked.tiktok_username && d.tiktok_username.value) {
      setTiktokUsername(d.tiktok_username.value);
    }
    if (discoveryPicked.youtube_channel_url && d.youtube_channel_url.value) {
      setYoutubeChannelUrl(d.youtube_channel_url.value);
    }
    if (discoveryPicked.snapchat_handle && d.snapchat_handle.value) {
      setSnapchatHandle(d.snapchat_handle.value);
    }
    if (discoveryPicked.google_domain && d.google_domain.value) {
      setGoogleDomain(d.google_domain.value);
    }
    if (discoveryPicked.category && d.category.value) {
      setCategory(d.category.value);
    }
    if (discoveryPicked.country && d.country.value) {
      setSelectedCountries((prev) => {
        const next = new Set(prev);
        next.add(d.country.value!);
        return [...next];
      });
    }
    setDiscovery(null);
    toast.success(t("newCompetitor", "discoveryApplied"));
  }

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
  }, []);
  const { t, locale } = useT();
  const countries = useMemo(() => getCountries(locale), [locale]);

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    // After picking a country, reset the search so the next pick
    // starts from a clean filter — user feedback 2026-05-04: forcing
    // them to clear the input by hand was friction.
    setCountrySearch("");
  }

  function removeCountry(code: string) {
    setSelectedCountries((prev) => prev.filter((c) => c !== code));
  }

  const filteredCountries = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  async function createClient() {
    if (!newClientName.trim()) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newClientName.trim() }),
    });
    const json = await res.json();
    if (res.ok && json.id) {
      setClients((prev) => [...prev, json]);
      setClientId(json.id);
      setNewClientName("");
      toast.success(`${t("clients", "created")}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/competitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page_name: pageName,
        page_url: pageUrl.trim() || null,
        country: selectedCountries.length > 0 ? selectedCountries.join(", ") : null,
        category: category || null,
        client_id: clientId || null,
        instagram_username: instagramUsername.replace(/^@/, "").trim() || null,
        tiktok_username: tiktokUsername.replace(/^@/, "").trim() || null,
        snapchat_handle: snapchatHandle.replace(/^@/, "").trim() || null,
        youtube_channel_url: youtubeChannelUrl.trim() || null,
        google_advertiser_id: googleAdvertiserId.trim() || null,
        google_domain: googleDomain.trim() || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const { error } = await res
        .json()
        .catch(() => ({ error: t("newCompetitor", "error") }));
      toast.error(error);
      return;
    }
    const { id } = await res.json();
    toast.success(t("newCompetitor", "created"));
    router.push(`/competitors/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ─── Auto-discovery shortcut ──────────────────────────
          Sits ABOVE the manual form so the user sees it first.
          One domain in → all the public fields out, with a
          confirmation step before applying. */}
      <div className="rounded-xl border border-gold/40 bg-gold-soft/30 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-gold text-gold-foreground grid place-items-center shrink-0 shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h3 className="text-sm font-semibold leading-tight">
                {t("newCompetitor", "discoveryTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {t("newCompetitor", "discoverySubtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Globe className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="text"
                  value={discoveryDomain}
                  onChange={(e) => setDiscoveryDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runDiscovery();
                    }
                  }}
                  placeholder={t("newCompetitor", "discoveryPlaceholder")}
                  className="pl-9 h-9"
                  disabled={discoveryRunning}
                />
              </div>
              <Button
                type="button"
                onClick={runDiscovery}
                disabled={discoveryRunning || !discoveryDomain.trim()}
                size="sm"
                className="h-9 cursor-pointer gap-1.5"
              >
                {discoveryRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {discoveryRunning ? t("newCompetitor", "discoveryRunning") : t("newCompetitor", "discoveryRun")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Discovery confirmation dialog */}
      {discovery && (
        <DiscoveryConfirmDialog
          discovery={discovery}
          picked={discoveryPicked}
          onTogglePicked={(key) =>
            setDiscoveryPicked((p) => ({ ...p, [key]: !p[key] }))
          }
          onApply={applyDiscovery}
          onClose={() => setDiscovery(null)}
          t={t}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("newCompetitor", "pageNameLabel")}</Label>
            <Input
              id="name"
              required
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder={t("newCompetitor", "pageNamePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">
              {t("newCompetitor", "pageUrlLabel")}
              <span className="text-[10px] text-muted-foreground ml-2 font-normal">
                {t("newCompetitor", "optionalLabel")}
              </span>
            </Label>
            <Input
              id="url"
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://www.facebook.com/nike"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("newCompetitor", "pageUrlHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram">{t("newCompetitor", "instagramLabel")}</Label>
            <Input
              id="instagram"
              value={instagramUsername}
              onChange={(e) => setInstagramUsername(e.target.value)}
              placeholder={t("newCompetitor", "instagramPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tiktok">{t("newCompetitor", "tiktokLabel")}</Label>
            <Input
              id="tiktok"
              value={tiktokUsername}
              onChange={(e) => setTiktokUsername(e.target.value)}
              placeholder={t("newCompetitor", "tiktokPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="snapchat">{t("newCompetitor", "snapchatLabel")}</Label>
            <Input
              id="snapchat"
              value={snapchatHandle}
              onChange={(e) => setSnapchatHandle(e.target.value)}
              placeholder={t("newCompetitor", "snapchatPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="youtube">{t("newCompetitor", "youtubeLabel")}</Label>
            <Input
              id="youtube"
              value={youtubeChannelUrl}
              onChange={(e) => setYoutubeChannelUrl(e.target.value)}
              placeholder={t("newCompetitor", "youtubePlaceholder")}
            />
          </div>

          {/* Google Ads fields */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">
              {t("newCompetitor", "googleAdsSection")}
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="googleDomain">{t("newCompetitor", "googleDomainLabel")}</Label>
                <Input
                  id="googleDomain"
                  value={googleDomain}
                  onChange={(e) => setGoogleDomain(e.target.value)}
                  placeholder={t("newCompetitor", "googleDomainPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="googleAdvertiserId">{t("newCompetitor", "googleAdvertiserIdLabel")}</Label>
                  <div className="relative group">
                    <span className="size-4 rounded-full border border-muted-foreground/40 grid place-items-center text-[9px] text-muted-foreground cursor-help">i</span>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                      {t("newCompetitor", "googleAdvertiserIdTooltip")}
                    </div>
                  </div>
                </div>
                <Input
                  id="googleAdvertiserId"
                  value={googleAdvertiserId}
                  onChange={(e) => setGoogleAdvertiserId(e.target.value)}
                  placeholder="AR15497895950085120"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              {t("newCompetitor", "categoryLabel")}
            </Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <option value="" className="bg-card">
                — {t("newCompetitor", "selectCategory")}
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-card">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("clients", "clientLabel")}</Label>
            <div className="flex gap-2">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <option value="" className="bg-card">
                  — {t("clients", "noClient")}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-card">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={t("clients", "newClientPlaceholder")}
                className="text-xs h-8"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createClient())}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0"
                onClick={createClient}
                disabled={!newClientName.trim()}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right column — Country multi-select */}
        <div className="space-y-2">
          <Label>{t("newCompetitor", "countryLabel")}</Label>

          {/* Selected countries chips */}
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedCountries.map((code) => {
                const c = countries.find((x) => x.code === code);
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-1 text-xs font-medium"
                  >
                    {code}
                    <button
                      type="button"
                      onClick={() => removeCountry(code)}
                      className="hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search */}
          <Input
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder={t("newCompetitor", "searchCountry")}
            className="text-xs"
          />

          {/* Country grid */}
          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 grid grid-cols-2 gap-1">
            {filteredCountries.map((c) => {
              const selected = selectedCountries.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCountry(c.code)}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                    selected
                      ? "bg-gold/15 text-gold border border-gold/30"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="font-medium w-6">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
            {filteredCountries.length === 0 && (
              <p className="col-span-2 text-center text-[10px] text-muted-foreground py-4">
                {t("newCompetitor", "noCountryMatch")}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? t("newCompetitor", "createLoading")
          : t("newCompetitor", "createSubmit")}
      </Button>
    </form>
  );
}

/* ─── Discovery confirmation dialog ───────────────────────────
   Modal that lists every field the discovery returned plus a
   checkbox per row. Checked rows get applied to the form on
   "Apply"; unchecked stay as the user originally had them.
   Confidence shown as a small bar so the user can prioritise
   reviewing the lower-confidence guesses. */
function DiscoveryConfirmDialog({
  discovery,
  picked,
  onTogglePicked,
  onApply,
  onClose,
  t,
}: {
  discovery: DiscoveryResult;
  picked: Record<string, boolean>;
  onTogglePicked: (key: string) => void;
  onApply: () => void;
  onClose: () => void;
  t: (s: string, k: string) => string;
}) {
  const rows: { key: string; label: string; field: { value: string | null; confidence: number; source: string } }[] = [
    { key: "page_name", label: t("newCompetitor", "pageNameLabel"), field: discovery.page_name },
    { key: "category", label: t("newCompetitor", "categoryLabel"), field: discovery.category },
    { key: "country", label: t("newCompetitor", "countryLabel"), field: discovery.country },
    { key: "instagram_username", label: t("newCompetitor", "instagramLabel"), field: discovery.instagram_username },
    { key: "tiktok_username", label: t("newCompetitor", "tiktokLabel"), field: discovery.tiktok_username },
    { key: "youtube_channel_url", label: t("newCompetitor", "youtubeLabel"), field: discovery.youtube_channel_url },
    { key: "snapchat_handle", label: t("newCompetitor", "snapchatLabel"), field: discovery.snapchat_handle },
    { key: "page_url", label: t("newCompetitor", "pageUrlLabel"), field: discovery.page_url },
    { key: "google_domain", label: t("newCompetitor", "googleDomainLabel"), field: discovery.google_domain },
  ];
  const found = rows.filter((r) => r.field.value).length;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-gold" />
              <h2 className="text-base font-semibold">
                {t("newCompetitor", "discoveryDialogTitle")}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("newCompetitor", "discoveryDialogSubtitle").replace("{n}", String(found))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-3 divide-y divide-border">
          {rows.map((r) => {
            const isFound = !!r.field.value;
            const checked = picked[r.key] ?? false;
            return (
              <div key={r.key} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => isFound && onTogglePicked(r.key)}
                  disabled={!isFound}
                  className={cn(
                    "size-5 rounded border grid place-items-center shrink-0 transition-colors",
                    !isFound && "border-border bg-muted/30 cursor-not-allowed",
                    isFound && checked && "border-gold bg-gold cursor-pointer",
                    isFound && !checked && "border-border hover:border-gold/40 cursor-pointer",
                  )}
                >
                  {checked && isFound && (
                    <Check className="size-3 text-gold-foreground" strokeWidth={3} />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {r.label}
                    </span>
                    {isFound && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {r.field.source}
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-sm mt-0.5 truncate",
                      isFound ? "text-foreground" : "text-muted-foreground/60 italic",
                    )}
                  >
                    {r.field.value ?? t("newCompetitor", "discoveryNotFound")}
                  </p>
                </div>
                {isFound && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          r.field.confidence >= 70 && "bg-success",
                          r.field.confidence >= 40 && r.field.confidence < 70 && "bg-warning",
                          r.field.confidence < 40 && "bg-muted-foreground/40",
                        )}
                        style={{ width: `${r.field.confidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                      {r.field.confidence}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t("newCompetitor", "discoveryDialogHint")}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("newCompetitor", "discoveryDialogCancel")}
            </Button>
            <Button type="button" size="sm" onClick={onApply}>
              {t("newCompetitor", "discoveryDialogApply")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
