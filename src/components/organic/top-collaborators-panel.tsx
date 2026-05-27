"use client";

/**
 * Pannello aggregato dei collaboratori ricorrenti per un brand.
 * Mostra i top N account taggati/menzionati nei post organic
 * (esclusi auto-tag del brand stesso) ordinati per frequenza.
 *
 * Il signal pratico: account che compaiono N volte = ambassador
 * strutturali (collab continuativa); account con count=1 = collab
 * one-shot.
 *
 * Livello 2/3 (2026-05-25): il bottone "Analizza collaboratori" lancia
 * l'enrichment dei profili (L3: follower, verificato, bio, categoria,
 * tier dimensionale via Apify — solo IG per ora) e la classificazione
 * AI (L2: brand / influencer / celebrity / staff). On-demand con
 * preview di costo; lo stato per account arriva da
 * GET /api/organic/collab-accounts e si arricchisce in place dopo la
 * POST /api/organic/collab-analyze. Entrambi i livelli sono dietro
 * feature flag (vedi @/config/features).
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  BadgeCheck,
  Globe,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { cn, formatNumber } from "@/lib/utils";
import type { CollabFrequency } from "@/lib/organic/collaborations";
import {
  COLLAB_ENRICH_ENABLED,
  COLLAB_CLASSIFY_ENABLED,
} from "@/config/features";
import {
  collabEnrichCost,
  creditCosts,
  aiAnalysisAction,
} from "@/config/pricing";
import {
  ENRICH_PLATFORMS,
  needsEnrichment,
  needsClassification,
  type CollabAccount,
  type CollabPlatform,
  type CollabClassification,
} from "@/lib/organic/collab-intel";
import { notifyCreditsChanged } from "@/lib/credits/events";

type ModelTier = "cheap" | "pragmatic" | "premium";
const TIERS: ModelTier[] = ["cheap", "pragmatic", "premium"];
const TIER_STORAGE_KEY = "aiscan.collab.aiTier";

/** Label parlanti per i tier (i raw "cheap/pragmatic/premium" non
 *  dicono nulla all'utente). i18n key + flag "consigliata". */
const TIER_META: Record<
  ModelTier,
  { name: string; desc: string; recommended?: boolean }
> = {
  cheap: { name: "tierCheapName", desc: "tierCheapDesc" },
  pragmatic: {
    name: "tierPragmaticName",
    desc: "tierPragmaticDesc",
    recommended: true,
  },
  premium: { name: "tierPremiumName", desc: "tierPremiumDesc" },
};

const INITIAL_VISIBLE = 5;

/** Meta visiva per classificazione (label via i18n + colori). */
const CLS_META: Record<
  CollabClassification,
  { key: string; cls: string }
> = {
  brand: { key: "clsBrand", cls: "border-gold/40 text-gold bg-gold/10" },
  influencer: {
    key: "clsInfluencer",
    cls: "border-blue-400/40 text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40",
  },
  celebrity: {
    key: "clsCelebrity",
    cls: "border-purple-400/40 text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40",
  },
  staff: {
    key: "clsStaff",
    cls: "border-border text-muted-foreground bg-muted",
  },
  unknown: { key: "clsUnknown", cls: "border-border text-muted-foreground" },
};

/** Fascia dimensionale (audience) leggibile + range esplicito. Il
 *  valore DB "mid" e' la fascia micro (10–100k): mostriamo label +
 *  range cosi' "mid" non resta un token criptico. */
const SIZE_TIER: Record<string, { label: string; range: string }> = {
  nano: { label: "Nano", range: "<10k" },
  mid: { label: "Micro", range: "10–100k" },
  macro: { label: "Macro", range: "100k–1M" },
  mega: { label: "Mega", range: "1M+" },
};


/** URL del profilo per piattaforma. Preferenza: IG se presente,
 *  altrimenti TikTok. */
function profileUrlFor(handle: string, platforms: Set<string>): string {
  if (platforms.has("instagram")) {
    return `https://www.instagram.com/${handle}/`;
  }
  if (platforms.has("tiktok")) {
    return `https://www.tiktok.com/@${handle}`;
  }
  return `https://www.instagram.com/${handle}/`;
}

/** Avatar del collaboratore: foto profilo da enrichment con fallback
 *  alle iniziali (le URL CDN di IG possono scadere / bloccare hotlink,
 *  quindi onError -> cerchio con la prima lettera). */
function CollabAvatar({ handle, src }: { handle: string; src: string | null }) {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={handle}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setErrored(true)}
        className="size-14 rounded-full object-cover border border-border bg-muted"
      />
    );
  }
  return (
    <div className="size-14 rounded-full border border-border bg-gold-soft text-gold flex items-center justify-center text-lg font-semibold">
      {handle.charAt(0).toUpperCase()}
    </div>
  );
}

export function TopCollaboratorsPanel({
  collaborators,
  totalCollabPosts,
  totalPosts,
  competitorId,
  platform,
}: {
  /** Gia' ordinati per count desc dal server. */
  collaborators: CollabFrequency[];
  /** Quanti post nel set hanno almeno un account esterno (= sono collab). */
  totalCollabPosts: number;
  /** Total posts considered (denominatore). */
  totalPosts: number;
  /** Brand corrente — serve alla POST analyze (scoping + nome brand). */
  competitorId: string;
  /** Canale del tab in cui il pannello e' montato. */
  platform: CollabPlatform;
}) {
  const { t, locale } = useT();
  const [expanded, setExpanded] = useState(false);

  // ── Stato intel (L2/L3) ──
  const intelEnabled = COLLAB_ENRICH_ENABLED || COLLAB_CLASSIFY_ENABLED;
  const canEnrich =
    COLLAB_ENRICH_ENABLED && ENRICH_PLATFORMS.includes(platform);
  const [accounts, setAccounts] = useState<Map<string, CollabAccount>>(
    new Map(),
  );
  const [tier, setTier] = useState<ModelTier>("pragmatic");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    enriched: number;
    classified: number;
    notFound: number;
  } | null>(null);
  const [clsFilter, setClsFilter] = useState<CollabClassification | "all">(
    "all",
  );

  // Tier persistito (come in Compare).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TIER_STORAGE_KEY);
    if (stored === "cheap" || stored === "pragmatic" || stored === "premium") {
      setTier(stored);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TIER_STORAGE_KEY, tier);
  }, [tier]);

  // Carica lo stato cache (enrichment + classifica) al mount.
  useEffect(() => {
    if (!intelEnabled) return;
    let active = true;
    fetch(`/api/organic/collab-accounts?platform=${platform}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.accounts) return;
        const m = new Map<string, CollabAccount>();
        for (const a of data.accounts as CollabAccount[]) m.set(a.handle, a);
        setAccounts(m);
      })
      .catch(() => {
        /* fetch best-effort: l'aggregato L1 resta comunque visibile */
      });
    return () => {
      active = false;
    };
  }, [platform, intelEnabled]);

  // Preview costo: stessa logica pura del server (collab-intel) → nessun
  // mismatch tra preventivo mostrato e crediti addebitati.
  const preview = useMemo(() => {
    const toEnrich = canEnrich
      ? collaborators.filter((c) => needsEnrichment(accounts.get(c.handle)))
          .length
      : 0;
    const toClassify = COLLAB_CLASSIFY_ENABLED
      ? collaborators.filter((c) =>
          needsClassification(accounts.get(c.handle)),
        ).length
      : 0;
    const enrichCredits = collabEnrichCost(toEnrich);
    const classifyCredits =
      toClassify > 0 ? creditCosts[aiAnalysisAction(tier)] : 0;
    return {
      toEnrich,
      toClassify,
      enrichCredits,
      classifyCredits,
      total: enrichCredits + classifyCredits,
    };
  }, [collaborators, accounts, tier, canEnrich]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/organic/collab-analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          platform,
          tier,
          locale,
          handles: collaborators.map((c) => c.handle),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.accounts) {
        setError(t("organic", "collabAnalyzeError"));
        // Aggiorna comunque le righe se il server ne ha restituite
        // (es. enrichment ok ma classify fallita).
        if (data?.accounts) {
          const m = new Map<string, CollabAccount>();
          for (const a of data.accounts as CollabAccount[]) m.set(a.handle, a);
          setAccounts(m);
          // Enrichment parziale riuscito: crediti gia' consumati.
          notifyCreditsChanged();
        }
        return;
      }
      const m = new Map<string, CollabAccount>();
      for (const a of data.accounts as CollabAccount[]) m.set(a.handle, a);
      setAccounts(m);
      notifyCreditsChanged();
      setResult({
        enriched: data.enriched ?? 0,
        classified: data.classified ?? 0,
        notFound: data.notFound ?? 0,
      });
    } catch {
      setError(t("organic", "collabAnalyzeError"));
    } finally {
      setAnalyzing(false);
    }
  }, [competitorId, platform, tier, locale, collaborators, t]);

  // Conteggi per chip di filtro classificazione. Hook prima di QUALSIASI
  // early return per rispettare le Rules of Hooks.
  const clsCounts = useMemo(() => {
    const counts: Partial<Record<CollabClassification, number>> = {};
    for (const c of collaborators) {
      const cls = accounts.get(c.handle)?.classification;
      if (cls) counts[cls] = (counts[cls] ?? 0) + 1;
    }
    return counts;
  }, [collaborators, accounts]);

  if (collaborators.length === 0 || totalPosts === 0) {
    return null;
  }

  const hasAnyClassification = Object.keys(clsCounts).length > 0;
  const collabRate =
    totalPosts > 0 ? Math.round((totalCollabPosts / totalPosts) * 100) : 0;

  // Applica il filtro classificazione, poi slice per il "mostra tutti".
  const filtered =
    clsFilter === "all"
      ? collaborators
      : collaborators.filter(
          (c) => accounts.get(c.handle)?.classification === clsFilter,
        );
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hidden = filtered.length - visible.length;

  const creditWord = (n: number) =>
    n === 1 ? t("organic", "creditUnit") : t("organic", "creditsUnit");
  const tierCost = (tr: ModelTier) => creditCosts[aiAnalysisAction(tr)];
  const nothingToDo = preview.total === 0 && preview.toClassify === 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {t("organic", "topCollabsTitle")}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({collaborators.length})
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t("organic", "topCollabsDescription")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-1">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {totalCollabPosts}
              <span className="text-base text-muted-foreground font-normal">
                {" "}
                /{totalPosts}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "collabPosts")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{collabRate}%</p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "collabRate")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {collaborators.filter((c) => c.count >= 2).length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "recurringCollabs")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {collaborators.filter((c) => c.count === 1).length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "oneShotCollabs")}
            </p>
          </div>
        </div>

        {/* ── Sub-frame con TITOLO: Analisi AI dei collaboratori (L2/L3) ── */}
        {intelEnabled && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-gold shrink-0" />
              <h4 className="text-sm font-semibold text-foreground">
                {t("organic", "collabAnalysisTitle")}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("organic", "collabAnalyzeHint")}
            </p>

            {/* Selettore profondità (modello AI) — label parlanti, costo
                esplicito, stato attivo leggibile (no testo nero su navy). */}
            {COLLAB_CLASSIFY_ENABLED && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  {t("organic", "collabTierLabel")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {TIERS.map((tr) => {
                    const meta = TIER_META[tr];
                    const isActive = tier === tr;
                    return (
                      <button
                        key={tr}
                        type="button"
                        onClick={() => setTier(tr)}
                        aria-pressed={isActive}
                        className={cn(
                          "text-left rounded-md border p-2 cursor-pointer transition-colors",
                          isActive
                            ? "border-gold bg-gold-soft ring-1 ring-gold"
                            : "border-border bg-background hover:border-gold/50",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-foreground">
                            {t("organic", meta.name)}
                          </span>
                          <span className="text-[11px] font-semibold text-gold tabular-nums shrink-0">
                            {tierCost(tr)} {creditWord(tierCost(tr))}
                          </span>
                        </span>
                        <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                          {t("organic", meta.desc)}
                          {meta.recommended
                            ? ` · ${t("organic", "recommended")}`
                            : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground italic leading-snug">
                  {t("organic", "collabTierExplain")}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Button
                size="sm"
                onClick={handleAnalyze}
                disabled={analyzing || nothingToDo}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("organic", "analyzingCollabs")}
                  </>
                ) : nothingToDo ? (
                  <>
                    <Sparkles className="size-4" />
                    {t("organic", "collabAllAnalyzed")}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    {t("organic", "analyzeCollabs")} · {preview.total}{" "}
                    {creditWord(preview.total)}
                  </>
                )}
              </Button>
              {/* Breakdown costo: come si compone il totale in crediti */}
              {!nothingToDo && !analyzing && (
                <p className="text-xs text-muted-foreground">
                  {preview.toEnrich > 0 && (
                    <span>
                      {preview.toEnrich} {t("organic", "collabEnrichPart")} (
                      {preview.enrichCredits}{" "}
                      {creditWord(preview.enrichCredits)})
                    </span>
                  )}
                  {preview.toEnrich > 0 && preview.classifyCredits > 0 && " + "}
                  {preview.classifyCredits > 0 && (
                    <span>
                      {t("organic", "collabClassifyPart")} (
                      {preview.classifyCredits}{" "}
                      {creditWord(preview.classifyCredits)})
                    </span>
                  )}
                </p>
              )}
              {result && (
                <p className="text-xs font-medium text-foreground">
                  {result.enriched > 0 &&
                    `${result.enriched} ${t("organic", "collabEnriched")}`}
                  {result.enriched > 0 && result.classified > 0 && " · "}
                  {result.classified > 0 &&
                    `${result.classified} ${t("organic", "collabClassified")}`}
                  {result.notFound > 0 &&
                    ` · ${result.notFound} ${t("organic", "collabNotFoundLabel")}`}
                </p>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>
        )}

        {/* ── Filtro classificazione ── */}
        {hasAnyClassification && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setClsFilter("all")}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors border",
                clsFilter === "all"
                  ? "bg-gold text-gold-foreground border-gold"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t("organic", "collabFilterAll")} ({collaborators.length})
            </button>
            {(Object.keys(CLS_META) as CollabClassification[])
              .filter((cls) => (clsCounts[cls] ?? 0) > 0)
              .map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClsFilter(cls)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors border",
                    clsFilter === cls
                      ? "bg-gold text-gold-foreground border-gold"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("organic", CLS_META[cls].key)} ({clsCounts[cls]})
                </button>
              ))}
            <span className="ml-auto text-[11px] text-muted-foreground italic">
              {t("organic", "collabAiNote")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
          {visible.map((c) => {
            const acc = accounts.get(c.handle);
            const cls = acc?.classification ?? null;
            return (
              <div
                key={c.handle}
                className="rounded-lg border border-border bg-card p-3 flex flex-col items-center text-center gap-1.5"
              >
                <CollabAvatar handle={c.handle} src={acc?.profile_pic_url ?? null} />
                <a
                  href={profileUrlFor(c.handle, c.platforms)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 max-w-full min-w-0 text-foreground hover:text-gold group"
                >
                  <span className="truncate text-xs font-semibold">
                    @{c.handle}
                  </span>
                  {acc?.verified && (
                    <BadgeCheck
                      className="size-3.5 text-blue-500 shrink-0"
                      aria-label={t("organic", "collabVerified")}
                    />
                  )}
                  <ExternalLink className="size-3 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                </a>
                {acc?.full_name && (
                  <p
                    className="text-[11px] text-muted-foreground truncate max-w-full"
                    title={acc.biography ?? undefined}
                  >
                    {acc.full_name}
                  </p>
                )}
                {cls && (
                  <Badge
                    variant="outline"
                    className={cn("text-[11px] py-0 px-1.5", CLS_META[cls].cls)}
                    title={acc?.classification_reason ?? undefined}
                  >
                    {t("organic", CLS_META[cls].key)}
                  </Badge>
                )}
                {acc?.followers_count != null && (
                  <p className="text-xs text-foreground tabular-nums">
                    {formatNumber(acc.followers_count)}{" "}
                    <span className="text-muted-foreground font-normal">
                      {t("organic", "collabFollowers")}
                    </span>
                  </p>
                )}
                {acc?.tier && SIZE_TIER[acc.tier] && (
                  <p className="text-[11px] text-muted-foreground">
                    {SIZE_TIER[acc.tier].label}{" "}
                    <span className="opacity-70">
                      ({SIZE_TIER[acc.tier].range})
                    </span>
                  </p>
                )}
                {(acc?.posts_count != null || acc?.follows_count != null) && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {acc?.posts_count != null &&
                      `${formatNumber(acc.posts_count)} ${t("organic", "collabPostsCount")}`}
                    {acc?.posts_count != null &&
                      acc?.follows_count != null &&
                      " · "}
                    {acc?.follows_count != null &&
                      `${formatNumber(acc.follows_count)} ${t("organic", "collabFollowing")}`}
                  </p>
                )}
                {acc?.category && (
                  <p className="text-[11px] text-muted-foreground truncate max-w-full">
                    {acc.category}
                  </p>
                )}
                {acc?.external_url && (
                  <a
                    href={acc.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline max-w-full min-w-0"
                  >
                    <Globe className="size-3 shrink-0" />
                    <span className="truncate">{t("organic", "collabWebsite")}</span>
                  </a>
                )}
              </div>
            );
          })}
        </div>
        {(hidden > 0 || expanded) && filtered.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            className="flex items-center gap-1 text-[11px] text-gold hover:text-gold/80 transition-colors font-medium cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" />
                {t("organic", "showLess")}
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                {t("organic", "showAllCollaborators")} ({hidden})
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
