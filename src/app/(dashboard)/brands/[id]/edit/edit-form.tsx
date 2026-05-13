"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Trash2, Plus, Sparkles, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldWithVerifyLink } from "@/components/ui/field-with-verify-link";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitCompetitor } from "@/types";
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

function parseCountries(val: string | null): string[] {
  if (!val) return [];
  return val
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function EditCompetitorForm({
  competitor,
  deleteCounts,
}: {
  competitor: MaitCompetitor;
  /** Pre-fetched on the server so the destructive-action dialog can
   *  show concrete numbers ("36 ads, 12 post, 4 scan job, 2 compare")
   *  without an extra round trip the moment the user clicks Delete. */
  deleteCounts?: {
    ads: number;
    posts: number;
    jobs: number;
    comparisons: number;
  };
}) {
  const router = useRouter();
  const [pageName, setPageName] = useState(competitor.page_name);
  const [pageUrl, setPageUrl] = useState<string | null>(competitor.page_url);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    parseCountries(competitor.country)
  );
  const [category, setCategory] = useState(competitor.category ?? "");
  const [instagramUsername, setInstagramUsername] = useState(competitor.instagram_username ?? "");
  const [tiktokUsername, setTiktokUsername] = useState(competitor.tiktok_username ?? "");
  // Optional TikTok Business advertiser ID (numeric string). Empty in
  // 95% of cases — silva DSA scrape works on `adv_name` alone for
  // brands with a unique TikTok display name. The override is here
  // for the edge case where same-name brands need disambiguating.
  const [tiktokAdvertiserId, setTiktokAdvertiserId] = useState(
    competitor.tiktok_advertiser_id ?? "",
  );
  const [snapchatHandle, setSnapchatHandle] = useState(competitor.snapchat_handle ?? "");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState(competitor.youtube_channel_url ?? "");
  const [googleAdvertiserId, setGoogleAdvertiserId] = useState(competitor.google_advertiser_id ?? "");
  const [googleDomain, setGoogleDomain] = useState(competitor.google_domain ?? "");
  const [clientId, setClientId] = useState(competitor.client_id ?? "");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [newClientName, setNewClientName] = useState("");
  // Sub-brand attribution
  const [parentBrandId, setParentBrandId] = useState(
    (competitor as { parent_brand_id?: string | null }).parent_brand_id ?? "",
  );
  const [attributionPatternsRaw, setAttributionPatternsRaw] = useState(
    ((competitor as { attribution_url_patterns?: string[] | null })
      .attribution_url_patterns ?? []).join("\n"),
  );
  const [brandsForParent, setBrandsForParent] = useState<
    { id: string; name: string }[]
  >([]);
  const [applyingAttribution, setApplyingAttribution] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Brand auto-discovery (Strategy A) ────────────────────────
  // Stesso pattern del form di creazione (new/form.tsx) replicato
  // qui perche' molti brand sono stati creati prima della feature
  // auto-fill e hanno proprieta' incomplete. Pre-popoliamo il
  // dominio col google_domain del brand (= sito istituzionale).
  //
  // ATTENZIONE: NON usare page_url come fallback se sembra una
  // social platform URL (facebook.com, instagram.com, ecc): il
  // page_url tipicamente punta alla Facebook page del brand
  // (es. "facebook.com/marinarinaldi"), e pre-popolare l'auto-
  // fill con "facebook.com" e' un nonsense — bug segnalato
  // 2026-05-07.
  const initialDiscoveryDomain = (() => {
    const SOCIAL_HOSTS = new Set([
      "facebook.com",
      "fb.com",
      "instagram.com",
      "tiktok.com",
      "youtube.com",
      "youtu.be",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "pinterest.com",
      "snapchat.com",
      "threads.net",
    ]);
    const extractHost = (url: string | null): string | null => {
      if (!url) return null;
      try {
        const u = url.startsWith("http") ? url : `https://${url}`;
        const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
        return host || null;
      } catch {
        return null;
      }
    };
    // 1. google_domain ha priorita' (campo pensato per il sito).
    const fromGoogle = extractHost(competitor.google_domain ?? null);
    if (fromGoogle && !SOCIAL_HOSTS.has(fromGoogle)) return fromGoogle;
    // 2. page_url solo se NON e' una social platform.
    const fromPage = extractHost(competitor.page_url ?? null);
    if (fromPage && !SOCIAL_HOSTS.has(fromPage)) return fromPage;
    return "";
  })();
  const [discoveryDomain, setDiscoveryDomain] = useState(
    initialDiscoveryDomain,
  );
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  // Modalita' applicazione: di default solo i campi VUOTI vengono
  // sovrascritti, cosi' un utente che ri-esegue la discovery non
  // perde valori manualmente corretti. Toggle "Sovrascrivi tutti"
  // per usi specifici (es. brand cambia dominio).
  const [discoveryOverwrite, setDiscoveryOverwrite] = useState(false);

  async function runDiscovery() {
    if (!discoveryDomain.trim()) return;
    setDiscoveryRunning(true);
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

      if (!d.fetched) {
        if (
          d.google_domain.value &&
          d.google_domain.confidence >= 50 &&
          (discoveryOverwrite || !googleDomain.trim())
        ) {
          setGoogleDomain(d.google_domain.value);
        }
        // Se il sito ha bot detection (Cloudflare/Akamai) e il
        // fallback Apify richiede approvazione, mostra un toast
        // con link cliccabile invece del generico "unreachable".
        if (d.needsApprovalUrl) {
          toast.warning(t("editCompetitor", "discoveryNeedsApproval"), {
            duration: 12_000,
            action: {
              label: t("editCompetitor", "discoveryApproveBtn"),
              onClick: () =>
                window.open(d.needsApprovalUrl!, "_blank", "noopener"),
            },
          });
        } else {
          toast.warning(t("newCompetitor", "discoveryNoFetch"));
        }
        return;
      }

      let applied = 0;
      let skipped = 0;
      const apply = <T,>(
        field: { value: T | null; confidence: number },
        currentValue: T,
        setter: (v: T) => void,
      ) => {
        if (!field.value || field.confidence < 50) return;
        // Determina se il campo corrente e' "vuoto":
        const isEmpty =
          currentValue == null ||
          (typeof currentValue === "string" && currentValue.trim() === "") ||
          (Array.isArray(currentValue) && currentValue.length === 0);
        if (!isEmpty && !discoveryOverwrite) {
          skipped += 1;
          return;
        }
        setter(field.value);
        applied += 1;
      };

      apply(d.page_name, pageName, setPageName);
      apply(d.page_url, pageUrl ?? "", (v) => setPageUrl(v));
      apply(d.instagram_username, instagramUsername, setInstagramUsername);
      apply(d.tiktok_username, tiktokUsername, setTiktokUsername);
      apply(d.youtube_channel_url, youtubeChannelUrl, setYoutubeChannelUrl);
      apply(d.snapchat_handle, snapchatHandle, setSnapchatHandle);
      apply(d.google_domain, googleDomain, setGoogleDomain);

      if (applied === 0 && skipped === 0) {
        toast.warning(t("newCompetitor", "discoveryNoFields"));
      } else if (applied === 0 && skipped > 0) {
        toast.info(
          t("editCompetitor", "discoveryAllFilled").replace(
            "{n}",
            String(skipped),
          ),
        );
      } else {
        const base = t("newCompetitor", "discoveryAppliedN").replace(
          "{n}",
          String(applied),
        );
        const extra =
          skipped > 0
            ? ` · ${t("editCompetitor", "discoverySkippedN").replace(
                "{n}",
                String(skipped),
              )}`
            : "";
        toast.success(base + extra);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscoveryRunning(false);
    }
  }

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
    // Carica i brand del workspace (escluso il brand corrente) per
    // popolare il dropdown "Brand parent" della sezione Sub-brand
    // attribution.
    fetch("/api/competitors")
      .then((r) => r.json())
      .then((d) => {
        const arr =
          Array.isArray(d) ? d : Array.isArray(d?.competitors) ? d.competitors : [];
        const mapped = (arr as { id: string; page_name: string | null }[])
          .filter((b) => b.id !== competitor.id)
          .map((b) => ({ id: b.id, name: b.page_name ?? "(senza nome)" }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setBrandsForParent(mapped);
      })
      .catch(() => {});
  }, [competitor.id]);
  const [countrySearch, setCountrySearch] = useState("");
  const { t, locale } = useT();
  const countries = useMemo(() => getCountries(locale), [locale]);

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    // Reset the search input after pick — same friction fix as the
    // new-brand form (2026-05-04 user feedback).
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Parsing pattern URL: una regex per riga, trim, skip righe vuote.
    const parsedPatterns = attributionPatternsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch(`/api/competitors/${competitor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page_name: pageName,
        page_url: pageUrl?.trim() || null,
        country: selectedCountries.length > 0 ? selectedCountries.join(", ") : null,
        category: category || null,
        client_id: clientId || null,
        instagram_username: instagramUsername.replace(/^@/, "").trim() || null,
        tiktok_username: tiktokUsername.replace(/^@/, "").trim() || null,
        tiktok_advertiser_id: tiktokAdvertiserId.trim() || null,
        snapchat_handle: snapchatHandle.replace(/^@/, "").trim() || null,
        youtube_channel_url: youtubeChannelUrl.trim() || null,
        google_advertiser_id: googleAdvertiserId.trim() || null,
        google_domain: googleDomain.trim() || null,
        parent_brand_id: parentBrandId || null,
        attribution_url_patterns: parsedPatterns.length > 0 ? parsedPatterns : null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Error" }));
      toast.error(json.error);
      return;
    }
    toast.success(t("editCompetitor", "saved"));
    router.push(`/brands/${competitor.id}`);
    router.refresh();
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/competitors/${competitor.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!res.ok) {
      toast.error(t("editCompetitor", "deleteError"));
      return;
    }
    toast.success(t("editCompetitor", "deleted"));
    router.push("/brands");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ─── Auto-discovery shortcut ──────────────────────────
            Uguale al form di creazione (new/form.tsx) ma con
            toggle "Sovrascrivi tutti" di default OFF: un brand
            esistente di solito ha gia' qualche campo corretto
            manualmente, e l'utente non vuole perderlo. Default:
            riempi solo i vuoti. */}
        <div className="rounded-xl border border-gold/40 bg-gold-soft/30 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-lg bg-gold text-gold-foreground grid place-items-center shrink-0 shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <h3 className="text-sm font-semibold leading-tight">
                  {t("editCompetitor", "discoveryTitle")}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {t("editCompetitor", "discoverySubtitle")}
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
                  {discoveryRunning
                    ? t("newCompetitor", "discoveryRunning")
                    : t("newCompetitor", "discoveryRun")}
                </Button>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={discoveryOverwrite}
                  onChange={(e) => setDiscoveryOverwrite(e.target.checked)}
                  className="size-3.5 cursor-pointer"
                />
                {t("editCompetitor", "discoveryOverwriteAll")}
              </label>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("newCompetitor", "pageNameLabel")}</Label>
              <Input
                id="name"
                required
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">
                {t("newCompetitor", "pageUrlLabel")}
              </Label>
              <FieldWithVerifyLink
                id="url"
                type="url"
                value={pageUrl ?? ""}
                onChange={(v) => setPageUrl(v)}
                verifyHref={pageUrl?.trim() || null}
                verifyLabel={t("newCompetitor", "verifyOnSite")}
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("newCompetitor", "pageUrlHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">{t("newCompetitor", "instagramLabel")}</Label>
              <FieldWithVerifyLink
                id="instagram"
                value={instagramUsername}
                onChange={(v) => setInstagramUsername(v)}
                placeholder={t("newCompetitor", "instagramPlaceholder")}
                verifyHref={
                  instagramUsername.trim()
                    ? `https://www.instagram.com/${instagramUsername.replace(/^@/, "").trim()}/`
                    : null
                }
                verifyLabel={t("newCompetitor", "verifyOnSite")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok">{t("newCompetitor", "tiktokLabel")}</Label>
              <FieldWithVerifyLink
                id="tiktok"
                value={tiktokUsername}
                onChange={(v) => setTiktokUsername(v)}
                placeholder={t("newCompetitor", "tiktokPlaceholder")}
                verifyHref={
                  tiktokUsername.trim()
                    ? `https://www.tiktok.com/@${tiktokUsername.replace(/^@/, "").trim()}`
                    : null
                }
                verifyLabel={t("newCompetitor", "verifyOnSite")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok-advertiser-id">
                {t("newCompetitor", "tiktokAdvertiserIdLabel")}
                <span className="text-[10px] text-muted-foreground ml-2 font-normal">
                  {t("newCompetitor", "optionalLabel")}
                </span>
              </Label>
              <Input
                id="tiktok-advertiser-id"
                value={tiktokAdvertiserId}
                onChange={(e) => setTiktokAdvertiserId(e.target.value)}
                placeholder={t("newCompetitor", "tiktokAdvertiserIdPlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("newCompetitor", "tiktokAdvertiserIdHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapchat">{t("newCompetitor", "snapchatLabel")}</Label>
              <FieldWithVerifyLink
                id="snapchat"
                value={snapchatHandle}
                onChange={(v) => setSnapchatHandle(v)}
                placeholder={t("newCompetitor", "snapchatPlaceholder")}
                verifyHref={
                  snapchatHandle.trim()
                    ? `https://www.snapchat.com/add/${snapchatHandle.replace(/^@/, "").trim()}`
                    : null
                }
                verifyLabel={t("newCompetitor", "verifyOnSite")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube">{t("newCompetitor", "youtubeLabel")}</Label>
              <FieldWithVerifyLink
                id="youtube"
                value={youtubeChannelUrl}
                onChange={(v) => setYoutubeChannelUrl(v)}
                placeholder={t("newCompetitor", "youtubePlaceholder")}
                verifyHref={youtubeChannelUrl.trim() || null}
                verifyLabel={t("newCompetitor", "verifyOnSite")}
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
                  <FieldWithVerifyLink
                    id="googleDomain"
                    value={googleDomain}
                    onChange={(v) => setGoogleDomain(v)}
                    placeholder={t("newCompetitor", "googleDomainPlaceholder")}
                    verifyHref={
                      googleDomain.trim()
                        ? `https://${googleDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim()}`
                        : null
                    }
                    verifyLabel={t("newCompetitor", "verifyOnSite")}
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

            {/* Sub-brand attribution: per brand senza dominio proprio
                (es. Persona dentro marinarinaldi.com). Lo splitter
                automatico ri-assegna le ads del parent al sub-brand
                al prossimo scan. */}
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div>
                <Label className="flex items-center gap-2">
                  Sub-brand attribution
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold">
                    OPZIONALE
                  </span>
                </Label>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  {"Usa questa sezione se il brand non ha un dominio proprio e le sue ads finiscono nel pool di un brand parent (es. Persona dentro Marina Rinaldi). Le ads che matchano i pattern URL qui sotto verranno automaticamente ri-assegnate a questo brand dopo ogni scan Google del parent."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parentBrandId" className="text-xs">
                  Brand parent
                </Label>
                <select
                  id="parentBrandId"
                  value={parentBrandId}
                  onChange={(e) => setParentBrandId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <option value="" className="bg-card">
                    — nessuno (brand standalone)
                  </option>
                  {brandsForParent.map((b) => (
                    <option key={b.id} value={b.id} className="bg-card">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="attributionPatterns" className="text-xs">
                  Pattern URL (una regex per riga)
                </Label>
                <textarea
                  id="attributionPatterns"
                  value={attributionPatternsRaw}
                  onChange={(e) => setAttributionPatternsRaw(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  placeholder={"/persona([/?-]|$)\n/sale/persona"}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {"Regex POSIX case-insensitive applicate a landing_url delle ads del brand parent. Esempio per Persona: "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded">
                    /persona([/?-]|$)
                  </code>
                  {" matcha "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded">
                    marinarinaldi.com/persona/nuovi-arrivi
                  </code>
                  {" + "}
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded">
                    /sale/persona
                  </code>
                  .
                </p>
              </div>
              {parentBrandId && attributionPatternsRaw.trim().length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={applyingAttribution}
                  onClick={async () => {
                    setApplyingAttribution(true);
                    try {
                      // Prima salva le rule (PATCH brand)
                      const patchRes = await fetch(
                        `/api/competitors/${competitor.id}`,
                        {
                          method: "PATCH",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            parent_brand_id: parentBrandId,
                            attribution_url_patterns: attributionPatternsRaw
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          }),
                        },
                      );
                      if (!patchRes.ok) {
                        const j = await patchRes.json().catch(() => ({}));
                        toast.error(j.error ?? "Salvataggio rule fallito");
                        return;
                      }
                      // Poi applica
                      const res = await fetch(
                        `/api/competitors/${competitor.id}/apply-attribution`,
                        { method: "POST" },
                      );
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        toast.error(body.error ?? "Applicazione fallita");
                        return;
                      }
                      const moved = body.moved_for_this_brand ?? 0;
                      toast.success(
                        moved > 0
                          ? `${moved} ads ri-assegnate a questo brand`
                          : "Nessuna ad matcha i pattern (verifica regex e dati del parent)",
                      );
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Errore");
                    } finally {
                      setApplyingAttribution(false);
                    }
                  }}
                  className="gap-1.5"
                >
                  {applyingAttribution ? "Applicazione…" : "Salva e riassegna ora"}
                </Button>
              )}
            </div>

            {/* Category field hidden 2026-05-04 — same reasoning
                as the new-brand form: non e' un dato che drive
                l'analisi. Il valore esistente sul DB resta intoccato
                (PATCH non lo invia se non lo modifichiamo). Per i
                brand legacy con categoria gia' settata, il valore
                appare ancora come badge sulla brands list. */}
            <div className="space-y-2">
              <Label>{t("clients", "clientLabel")}</Label>
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
              <div className="flex gap-1.5">
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t("clients", "newClientPlaceholder")}
                  className="text-xs h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newClientName.trim()) return;
                      fetch("/api/clients", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ name: newClientName.trim() }),
                      })
                        .then((r) => r.json())
                        .then((json) => {
                          if (json.id) {
                            setClients((prev) => [...prev, json]);
                            setClientId(json.id);
                            setNewClientName("");
                          }
                        });
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 shrink-0"
                  onClick={() => {
                    if (!newClientName.trim()) return;
                    fetch("/api/clients", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name: newClientName.trim() }),
                    })
                      .then((r) => r.json())
                      .then((json) => {
                        if (json.id) {
                          setClients((prev) => [...prev, json]);
                          setClientId(json.id);
                          setNewClientName("");
                        }
                      });
                  }}
                  disabled={!newClientName.trim()}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("newCompetitor", "countryLabel")}</Label>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCountries.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-1 text-xs font-medium"
                  >
                    {code}
                    <button type="button" onClick={() => removeCountry(code)} className="hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder={t("newCompetitor", "searchCountry")}
              className="text-xs"
            />
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
            </div>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t("editCompetitor", "saving") : t("editCompetitor", "save")}
        </Button>
      </form>

      {/* Delete section */}
      <div className="border-t border-border pt-6">
        {!confirmDelete ? (
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            className="text-red-400 border-red-400/30 hover:bg-red-400/10 hover:border-red-400/50"
          >
            <Trash2 className="size-4" />
            {t("editCompetitor", "deleteBtn")}
          </Button>
        ) : (
          <div className="p-4 rounded-lg border border-red-400/30 bg-red-400/5 space-y-3">
            <p className="text-sm">
              {t("editCompetitor", "deleteConfirm")} <b>{competitor.page_name}</b>?
              {" "}{t("editCompetitor", "deleteWarning")}
            </p>
            {deleteCounts &&
              (deleteCounts.ads > 0 ||
                deleteCounts.posts > 0 ||
                deleteCounts.jobs > 0 ||
                deleteCounts.comparisons > 0) && (
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                  {deleteCounts.ads > 0 && (
                    <li>
                      <b className="text-foreground">{deleteCounts.ads}</b>{" "}
                      {t("editCompetitor", "deleteCountAds")}
                    </li>
                  )}
                  {deleteCounts.posts > 0 && (
                    <li>
                      <b className="text-foreground">{deleteCounts.posts}</b>{" "}
                      {t("editCompetitor", "deleteCountPosts")}
                    </li>
                  )}
                  {deleteCounts.jobs > 0 && (
                    <li>
                      <b className="text-foreground">{deleteCounts.jobs}</b>{" "}
                      {t("editCompetitor", "deleteCountJobs")}
                    </li>
                  )}
                  {deleteCounts.comparisons > 0 && (
                    <li>
                      <b className="text-foreground">
                        {deleteCounts.comparisons}
                      </b>{" "}
                      {t("editCompetitor", "deleteCountComparisons")}
                    </li>
                  )}
                </ul>
              )}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? t("editCompetitor", "deletingProgress") : t("editCompetitor", "confirmDelete")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {t("editCompetitor", "cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
