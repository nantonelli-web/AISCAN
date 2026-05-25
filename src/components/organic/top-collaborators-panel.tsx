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

type ModelTier = "cheap" | "pragmatic" | "premium";
const TIERS: ModelTier[] = ["cheap", "pragmatic", "premium"];
const TIER_STORAGE_KEY = "aiscan.collab.aiTier";

const TIKTOK_LABEL = "TikTok";
const IG_LABEL = "Instagram";
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
        }
        return;
      }
      const m = new Map<string, CollabAccount>();
      for (const a of data.accounts as CollabAccount[]) m.set(a.handle, a);
      setAccounts(m);
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
  const maxCount = collaborators[0]?.count ?? 1;
  const hidden = filtered.length - visible.length;

  const platformsInDataset = new Set<string>();
  for (const c of collaborators) {
    for (const p of c.platforms) platformsInDataset.add(p);
  }
  const showPlatformBadges = platformsInDataset.size > 1;

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

        {/* ── Intel toolbar (L2/L3): tier picker + CTA analizza ── */}
        {intelEnabled && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("organic", "collabAnalyzeHint")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {COLLAB_CLASSIFY_ENABLED && (
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  {TIERS.map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => setTier(tr)}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium capitalize cursor-pointer transition-colors",
                        tier === tr
                          ? "bg-gold text-black"
                          : "bg-transparent text-muted-foreground hover:text-foreground",
                      )}
                      title={`${tierCost(tr)} ${creditWord(tierCost(tr))}`}
                    >
                      {tr}
                    </button>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                onClick={handleAnalyze}
                disabled={analyzing || nothingToDo}
                className="h-8"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("organic", "analyzingCollabs")}
                  </>
                ) : nothingToDo ? (
                  <>
                    <Sparkles className="size-3.5" />
                    {t("organic", "collabAllAnalyzed")}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    {t("organic", "analyzeCollabs")} · {preview.total}{" "}
                    {creditWord(preview.total)}
                  </>
                )}
              </Button>
            </div>
            {/* Breakdown costo */}
            {!nothingToDo && !analyzing && (
              <p className="text-[10px] text-muted-foreground">
                {preview.toEnrich > 0 && (
                  <span>
                    {preview.toEnrich} {t("organic", "collabEnrichPart")} (
                    {preview.enrichCredits} {creditWord(preview.enrichCredits)})
                  </span>
                )}
                {preview.toEnrich > 0 && preview.classifyCredits > 0 && " · "}
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
              <p className="text-[11px] text-foreground">
                {result.enriched > 0 &&
                  `${result.enriched} ${t("organic", "collabEnriched")}`}
                {result.enriched > 0 && result.classified > 0 && " · "}
                {result.classified > 0 &&
                  `${result.classified} ${t("organic", "collabClassified")}`}
                {result.notFound > 0 &&
                  ` · ${result.notFound} ${t("organic", "collabNotFoundLabel")}`}
              </p>
            )}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            {hasAnyClassification && (
              <p className="text-[10px] text-muted-foreground italic">
                {t("organic", "collabAiNote")}
              </p>
            )}
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
                  ? "bg-gold text-black border-gold"
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
                      ? "bg-gold text-black border-gold"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("organic", CLS_META[cls].key)} ({clsCounts[cls]})
                </button>
              ))}
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          {visible.map((c) => {
            const acc = accounts.get(c.handle);
            const cls = acc?.classification ?? null;
            return (
              <div key={c.handle} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <a
                      href={profileUrlFor(c.handle, c.platforms)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground truncate hover:text-gold inline-flex items-center gap-1 group"
                    >
                      @{c.handle}
                      <ExternalLink className="size-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                    {acc?.verified && (
                      <BadgeCheck
                        className="size-3.5 text-blue-500 shrink-0"
                        aria-label={t("organic", "collabVerified")}
                      />
                    )}
                    {cls && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] py-0 px-1.5",
                          CLS_META[cls].cls,
                        )}
                        title={acc?.classification_reason ?? undefined}
                      >
                        {t("organic", CLS_META[cls].key)}
                      </Badge>
                    )}
                    {acc?.followers_count != null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatNumber(acc.followers_count)}{" "}
                        {t("organic", "collabFollowers")}
                        {acc.tier ? ` · ${acc.tier}` : ""}
                      </span>
                    )}
                    {showPlatformBadges && c.platforms.has("instagram") && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                        {IG_LABEL}
                      </Badge>
                    )}
                    {showPlatformBadges && c.platforms.has("tiktok") && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                        {TIKTOK_LABEL}
                      </Badge>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    <span className="text-foreground font-medium">
                      {c.count}
                    </span>{" "}
                    {c.count === 1
                      ? t("organic", "collabSingular")
                      : t("organic", "collabPlural")}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gold/70"
                    style={{ width: `${(c.count / maxCount) * 100}%` }}
                  />
                </div>
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
