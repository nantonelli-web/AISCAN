"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ChevronDown,
  Check,
  Store,
  Users,
  Star,
  Crown,
  Trophy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { notifyCreditsChanged } from "@/lib/credits/events";
import type {
  ComparisonFacts,
  MapsAnalysisMode,
  MapsAnalysisSection,
} from "@/lib/maps/analysis";

/* ─── Types ──────────────────────────────────────────────── */

export interface PanelPlace {
  id: string;
  title: string;
  domain: string | null;
  rank: number | null;
  rating: number | null;
  reviewsCount: number;
  hasPopularTimes: boolean;
  /** True se il place matcha un competitor tracciato. */
  isBrand: boolean;
}

interface AnalysisResult {
  facts: ComparisonFacts;
  sections: Partial<Record<MapsAnalysisSection, string>>;
  modelId: string;
  modelDisplay?: string;
}

interface AiModel {
  model_id: string;
  display_name: string;
  provider: string;
  credits_cost: number;
}

const SECTION_ORDER: MapsAnalysisSection[] = [
  "overview",
  "reputation",
  "footTraffic",
  "visibility",
  "recommendations",
];

const MODEL_STORAGE_KEY = "aiscan.maps.model_id";
const RECOMMENDED_MODEL_ID = "claude-haiku-4-5";

/* ─── Minimal markdown renderer (no deps, no XSS) ─────────── */

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function FormattedText({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, idx) => {
        const lines = block.split(/\n/);
        // A block where every line starts with "- " is a bullet list —
        // including a single-item block (LLMs often emit lone bullets);
        // without this it would fall through and render the literal "- ".
        const isList = lines.every((l) => l.trim().startsWith("- "));
        if (isList) {
          return (
            <ul
              key={idx}
              className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-foreground/90"
            >
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^-\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-sm leading-relaxed text-foreground/90">
            {renderInline(block)}
          </p>
        );
      })}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────── */

export function MapsAnalysisPanel({
  searchId,
  places,
}: {
  searchId: string;
  places: PanelPlace[];
}) {
  const { t } = useT();
  const [mode, setMode] = useState<MapsAnalysisMode>("cross_brand");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [cached, setCached] = useState(false);

  // Model picker
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const trigRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((j: { models?: AiModel[] }) => {
        if (!alive) return;
        const list = j.models ?? [];
        setModels(list);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(MODEL_STORAGE_KEY)
            : null;
        const pick =
          (stored && list.find((m) => m.model_id === stored)) ||
          list.find((m) => m.model_id === RECOMMENDED_MODEL_ID) ||
          list[0];
        if (pick) setModelId(pick.model_id);
      })
      .catch((e) => console.error("[MapsAnalysisPanel] models fetch:", e));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const node = e.target as Node;
      if (
        popRef.current &&
        !popRef.current.contains(node) &&
        trigRef.current &&
        !trigRef.current.contains(node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === modelId) ?? null,
    [models, modelId],
  );

  // Monotonic request id. Bumped whenever the inputs change (selection,
  // mode, model) AND at the start of each generate(); a slow in-flight
  // generate only applies its result if it's still the latest request,
  // so changing the selection mid-request can't repopulate the panel
  // with a stale report (and a spurious success toast).
  const reqIdRef = useRef(0);
  function invalidateResult() {
    reqIdRef.current++;
    setResult(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Una nuova selezione invalida il report mostrato.
    invalidateResult();
  }

  function pickModel(id: string) {
    setModelId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, id);
    }
    setOpen(false);
    invalidateResult();
  }

  // Quante schede sono selezionabili in un colpo solo (tetto a 6).
  const selectableCount = Math.min(6, places.length);
  const allSelected =
    selectableCount > 0 && selected.size >= selectableCount;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      // Prime 6 schede nell'ordine corrente (= classifica). Oltre il tetto
      // di 6 si avvisa l'utente che la selezione è troncata.
      const pick = places.slice(0, selectableCount).map((p) => p.id);
      setSelected(new Set(pick));
      if (places.length > 6) toast.info(t("maps", "analysisSelectAllCap"));
    }
    invalidateResult();
  }

  const canRun = selected.size >= 2 && selected.size <= 6 && !!modelId;

  async function generate(force = false) {
    if (!canRun) return;
    const myId = ++reqIdRef.current;
    setBusy(true);
    try {
      const res = await fetch(`/api/maps/searches/${searchId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          place_ids: Array.from(selected),
          model_id: modelId ?? undefined,
          force,
        }),
      });
      const j = await res.json().catch(() => ({}));
      // Credits were actually spent server-side on a non-cached run —
      // refresh the badge regardless of whether this is still the active
      // request.
      if (res.ok && !j.cached) notifyCreditsChanged();
      // Stale response (the user changed selection/mode/model meanwhile):
      // don't touch the UI or toast — it no longer matches the controls.
      if (reqIdRef.current !== myId) return;
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(
            `${t("maps", "analysisInsufficientCredits")} (${j.balance ?? "?"} / ${j.cost ?? "?"} cr)`,
          );
        } else {
          toast.error(j.error ?? t("maps", "analysisErrorGeneric"), {
            duration: 10000,
          });
        }
        return;
      }
      setResult(j.result as AnalysisResult);
      setCached(!!j.cached);
      toast.success(
        j.cached ? t("maps", "analysisServedCache") : t("maps", "analysisDone"),
      );
    } catch (e) {
      if (reqIdRef.current === myId) {
        toast.error(e instanceof Error ? e.message : t("maps", "analysisErrorGeneric"));
      }
    } finally {
      // Always clear busy: only one generate can be in flight (the button
      // is disabled while busy and invalidateResult doesn't start a fetch).
      setBusy(false);
    }
  }

  // Mappa placeId (= id interno) → titolo, per i leader nei fatti.
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of places) m.set(p.id, p.title);
    return m;
  }, [places]);

  const brandCount = places.filter((p) => p.isBrand).length;

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/3 to-transparent">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("maps", "analysisTitle")}
            </h2>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t("maps", "analysisDescription")}
            </p>
          </div>
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("maps", "analysisModeLabel")}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode("cross_brand");
                invalidateResult();
              }}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                mode === "cross_brand"
                  ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/40"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Users className="size-4 text-violet-500 mt-0.5 shrink-0" />
              <span>
                <span className="block text-[13px] font-medium">
                  {t("maps", "analysisModeCross")}
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug">
                  {t("maps", "analysisModeCrossHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("intra_brand");
                invalidateResult();
              }}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                mode === "intra_brand"
                  ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/40"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Store className="size-4 text-violet-500 mt-0.5 shrink-0" />
              <span>
                <span className="block text-[13px] font-medium">
                  {t("maps", "analysisModeIntra")}
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug">
                  {t("maps", "analysisModeIntraHint")}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Store selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("maps", "analysisSelectStores")}
            </span>
            <div className="flex items-center gap-2.5">
              {places.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                >
                  {allSelected
                    ? t("maps", "analysisClearAll")
                    : t("maps", "analysisSelectAll")}
                </button>
              )}
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {selected.size}/6 {t("maps", "analysisSelected")}
              </span>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {places.map((p) => {
              const isSel = selected.has(p.id);
              const disabled = !isSel && selected.size >= 6;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSel ? "bg-violet-500/10" : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`size-4 rounded border grid place-items-center shrink-0 ${
                      isSel
                        ? "bg-violet-500 border-violet-500 text-white"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSel && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      {p.rank != null && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          #{p.rank}
                        </span>
                      )}
                      <span className="text-[13px] font-medium truncate">
                        {p.title}
                      </span>
                      {p.isBrand && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 border-gold/50 text-gold"
                        >
                          {t("maps", "analysisTracked")}
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
                      {p.rating != null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="size-2.5 text-gold fill-gold" />
                          {p.rating.toFixed(1)}
                        </span>
                      )}
                      <span className="tabular-nums">
                        {p.reviewsCount} {t("maps", "reviews")}
                      </span>
                      {p.hasPopularTimes && (
                        <span className="text-emerald-500">
                          {t("maps", "analysisHasTraffic")}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {brandCount === 0 && mode === "intra_brand" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
              {t("maps", "analysisIntraNoBrandHint")}
            </p>
          )}
        </div>

        {/* Controls: model + generate */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-violet-500/15">
          <div className="relative flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
              {t("maps", "analysisModelLabel")}
            </span>
            <button
              ref={trigRef}
              type="button"
              onClick={() => setOpen((s) => !s)}
              disabled={models.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              {selectedModel ? (
                <span className="truncate max-w-[200px]">
                  {selectedModel.display_name}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {models.length === 0
                    ? t("maps", "analysisNoModels")
                    : "—"}
                </span>
              )}
              <ChevronDown
                className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && models.length > 0 && (
              <div
                ref={popRef}
                className="absolute left-0 top-full mt-1.5 z-[100] w-[300px] max-h-[340px] overflow-y-auto rounded-lg border border-border bg-background shadow-xl p-1"
                role="listbox"
              >
                {models.map((m) => {
                  const active = m.model_id === modelId;
                  return (
                    <button
                      key={m.model_id}
                      type="button"
                      onClick={() => pickModel(m.model_id)}
                      className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? "bg-violet-500/10 ring-1 ring-violet-500/40"
                          : "hover:bg-muted/60"
                      }`}
                      role="option"
                      aria-selected={active}
                    >
                      <span className="shrink-0">
                        {active ? (
                          <Check className="size-4 text-violet-500" />
                        ) : (
                          <span className="size-4 inline-block" />
                        )}
                      </span>
                      <span className="flex-1 text-[13px] font-medium truncate">
                        {m.display_name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {m.credits_cost} cr
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selectedModel && (
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                {t("maps", "analysisCost")}:{" "}
                <span className="font-semibold text-foreground">
                  {selectedModel.credits_cost}{" "}
                  {selectedModel.credits_cost === 1
                    ? t("maps", "analysisCredit")
                    : t("maps", "analysisCredits")}
                </span>
              </span>
            )}
            <Button
              type="button"
              onClick={() => generate(false)}
              disabled={!canRun || busy}
              className="gap-2 bg-violet-500 hover:bg-violet-600 text-white h-10 px-4"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : result ? (
                <RefreshCw className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {result
                ? t("maps", "analysisRegenerate")
                : t("maps", "analysisGenerate")}
            </Button>
          </div>
        </div>
        {selected.size < 2 && (
          <p className="text-[11px] text-muted-foreground">
            {t("maps", "analysisMinTwo")}
          </p>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-5 pt-4 border-t border-border">
            {cached && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <RefreshCw className="size-3" />
                {t("maps", "analysisCachedNote")}
                {result.modelDisplay ? ` · ${result.modelDisplay}` : ""}
              </div>
            )}

            <FactsTable facts={result.facts} titleById={titleById} />

            <div className="space-y-4">
              {SECTION_ORDER.filter((s) => result.sections[s]).map((s) => (
                <div key={s} className="space-y-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    {t("maps", `analysisSec_${s}`)}
                  </h3>
                  <FormattedText content={result.sections[s] as string} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Facts comparison table ─────────────────────────────── */

function FactsTable({
  facts,
  titleById,
}: {
  facts: ComparisonFacts;
  titleById: Map<string, string>;
}) {
  const { t } = useT();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground">
            <th className="text-left font-semibold px-3 py-2">
              {t("maps", "factsStore")}
            </th>
            <th className="text-right font-semibold px-3 py-2">
              {t("maps", "factsRank")}
            </th>
            <th className="text-right font-semibold px-3 py-2">
              {t("maps", "factsRating")}
            </th>
            <th className="text-right font-semibold px-3 py-2">
              {t("maps", "factsReviews")}
            </th>
            <th className="text-right font-semibold px-3 py-2">
              {t("maps", "factsOwner")}
            </th>
            <th className="text-right font-semibold px-3 py-2">GBP</th>
            <th className="text-right font-semibold px-3 py-2">
              {t("maps", "factsPeak")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {facts.entities.map((e) => {
            const isRatingLeader = e.placeId === facts.ratingLeader;
            const isReviewLeader = e.placeId === facts.reviewVolumeLeader;
            const isFtLeader = e.placeId === facts.footTrafficLeader;
            return (
              <tr key={e.placeId} className="hover:bg-muted/20">
                <td className="px-3 py-2 max-w-[220px]">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {titleById.get(e.placeId) ?? e.title}
                    </span>
                    {e.closed && (
                      <span className="text-[9px] text-red-400 uppercase">
                        {e.closed === "permanently" ? "closed" : "temp"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.rank ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {e.rating != null ? e.rating.toFixed(1) : "—"}
                    {isRatingLeader && (
                      <Crown className="size-3 text-gold" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {e.lifetimeReviews ?? "—"}
                    {isReviewLeader && (
                      <Trophy className="size-3 text-gold" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.ownerResponseRate != null ? `${e.ownerResponseRate}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.gbpScore != null && e.gbpMax != null
                    ? `${e.gbpScore}/${e.gbpMax}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {e.footTraffic
                      ? `${e.footTraffic.avgBusyness}%`
                      : "—"}
                    {isFtLeader && e.footTraffic && (
                      <Crown className="size-3 text-gold" />
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
