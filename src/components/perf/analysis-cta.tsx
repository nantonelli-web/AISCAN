"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Check,
  ChevronDown,
  Zap,
  Brain,
  Crown,
  Languages,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * AnalysisCta — pannello "Genera analisi AI" in cima e in fondo al
 * dashboard import. Il modello LLM si sceglie da una lista letta da
 * /api/ai/models (catalogo mait_ai_models gestito da Admin). Il
 * costo in crediti viene dal record del modello stesso. Il modello
 * scelto e' persistito in localStorage cosi resta coerente fra
 * visite.
 */

interface AiModel {
  model_id: string;
  display_name: string;
  provider: string;
  credits_cost: number;
  openrouter_id: string | null;
  supports_vision: boolean;
}

const STORAGE_KEY = "aiscan.perf.model_id";

function loadStoredModelId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function saveModelId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  meta: "Meta",
};

/** Pallini-colore per il chip provider — un colpo d'occhio per
 *  distinguere senza dover leggere il nome. */
const PROVIDER_DOT: Record<string, string> = {
  anthropic: "bg-amber-500",
  openai: "bg-emerald-500",
  google: "bg-sky-500",
  deepseek: "bg-violet-500",
  mistral: "bg-orange-500",
  meta: "bg-blue-600",
};

/** Hint user-friendly per orientare la scelta. Basato sul costo
 *  in crediti (proxy ragionevole della profondita'/qualita' del
 *  modello) + tag esplicito sul model_id quando rilevante. */
function modelHint(m: AiModel): { tag: string; tone: "fast" | "balanced" | "premium"; icon: typeof Zap } {
  const id = m.model_id.toLowerCase();
  if (id.includes("sonnet") || id.includes("gpt-4.1") || id.includes("gemini-2.5-pro")) {
    return { tag: "Profondo, analisi articolate", tone: "premium", icon: Crown };
  }
  if (m.credits_cost <= 1) {
    return { tag: "Veloce ed economico", tone: "fast", icon: Zap };
  }
  return { tag: "Buon equilibrio qualità/costo", tone: "balanced", icon: Brain };
}

const TONE_BG: Record<"fast" | "balanced" | "premium", string> = {
  fast: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  balanced: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  premium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/** Il default consigliato e' Claude Haiku 4.5 (claude-haiku-4-5):
 *  italiano nativo + costo minimo. Mostriamo un badge "consigliato"
 *  per orientare l'utente senza forzarlo. */
const RECOMMENDED_MODEL_ID = "claude-haiku-4-5";

export function AnalysisCta({
  importId,
  hasAnalyses,
  position,
  onGenerated,
  /** Forwardiamo lo stato comparison del dashboard per coerenza
   *  delle analisi (se l'utente ha filtrato per week, l'analisi
   *  riguarda solo quella week). */
  compareParams,
  /** True quando le analisi visualizzate sono in lingua diversa da
   *  quella corrente (es. UI in EN ma rows solo in IT). Mostriamo
   *  un hint che invita a rigenerare per tradurre. */
  crossLocale,
}: {
  importId: string;
  hasAnalyses: boolean;
  position: "top" | "bottom";
  onGenerated: () => void;
  compareParams?: Record<string, string>;
  crossLocale?: boolean;
}) {
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState<string | null>(() =>
    loadStoredModelId(),
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((j: { models?: AiModel[] }) => {
        if (!alive) return;
        const list = j.models ?? [];
        setModels(list);
        const stored = loadStoredModelId();
        if (!stored || !list.some((m) => m.model_id === stored)) {
          // Default: consigliato se presente, altrimenti il piu' economico.
          const pick =
            list.find((m) => m.model_id === RECOMMENDED_MODEL_ID) ?? list[0];
          if (pick) {
            setModelId(pick.model_id);
            saveModelId(pick.model_id);
          }
        }
      })
      .catch((e) => {
        console.error("[AnalysisCta] models fetch failed:", e);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = useMemo(
    () => models.find((m) => m.model_id === modelId) ?? null,
    [models, modelId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AiModel[]>();
    for (const m of models) {
      const key = m.provider;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [models]);

  function pickModel(id: string) {
    setModelId(id);
    saveModelId(id);
    setOpen(false);
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/perf/imports/${importId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model_id: modelId ?? undefined,
          force_overwrite_edited: false,
          ...(compareParams ?? {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(
            `Crediti insufficienti (saldo: ${j.balance ?? "?"}). Costo: ${j.cost ?? "?"} cr.`,
          );
        } else {
          const detail = Array.isArray(j.details)
            ? ` — ${j.details.slice(0, 1).join("; ")}`
            : "";
          const hint = j.hint ? ` (${j.hint})` : "";
          toast.error(
            `${j.error ?? "Generazione fallita"}${detail}${hint}`,
            { duration: 12000 },
          );
        }
        return;
      }
      const skipped = j.sections_skipped_edited ?? 0;
      toast.success(
        `Analisi generata (${j.sections_generated} sezioni${skipped > 0 ? ", " + skipped + " manuali preservate" : ""})`,
      );
      onGenerated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  const cost = selected?.credits_cost ?? null;
  const noModels = models.length === 0;
  const selectedHint = selected ? modelHint(selected) : null;

  return (
    <Card
      className={`print:hidden border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/3 to-transparent ${
        position === "bottom" ? "mt-2" : ""
      }`}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold uppercase tracking-wider">
              Analisi AI {position === "top" ? "del periodo" : "— rigenera"}
            </h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {hasAnalyses
                ? "Analisi gia' presenti per questo dashboard. Rigenera con un nuovo modello o quando i dati cambiano. Le sezioni modificate manualmente vengono preservate."
                : "Genera commenti discorsivi per ogni blocco del dashboard, con motivazioni dei trend e suggerimenti operativi basati su best practice del paid advertising."}
            </p>
          </div>
        </div>

        {crossLocale && hasAnalyses && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
            <Languages className="size-3.5 shrink-0 mt-0.5" />
            <span>
              {"Le analisi mostrate sono in un'altra lingua. Rigenera per ottenerle nella lingua attiva."}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-violet-500/15">
          <div className="flex items-center gap-2 min-w-0 relative flex-wrap">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
              Modello
            </span>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((s) => !s)}
              disabled={noModels}
              className="inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-expanded={open}
              aria-haspopup="listbox"
            >
              {selected ? (
                <>
                  <span
                    className={`size-2 rounded-full ${PROVIDER_DOT[selected.provider] ?? "bg-muted-foreground"}`}
                    aria-hidden
                  />
                  <span className="text-foreground truncate max-w-[220px]">
                    {selected.display_name}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {noModels ? "Nessun modello attivo" : "Seleziona…"}
                </span>
              )}
              <ChevronDown
                className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {selectedHint && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${TONE_BG[selectedHint.tone]}`}
                title={selectedHint.tag}
              >
                <selectedHint.icon className="size-3" />
                {selectedHint.tag}
              </span>
            )}
            {open && grouped.length > 0 && (
              <div
                ref={popoverRef}
                className="absolute left-0 top-full mt-1.5 z-[100] w-[420px] max-h-[420px] overflow-y-auto rounded-lg border border-border bg-background shadow-xl shadow-black/10 dark:shadow-black/50 p-1"
                role="listbox"
              >
                {grouped.map(([provider, list]) => (
                  <div key={provider} className="py-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                      <span
                        className={`size-1.5 rounded-full ${PROVIDER_DOT[provider] ?? "bg-muted-foreground"}`}
                        aria-hidden
                      />
                      {PROVIDER_LABEL[provider] ?? provider}
                    </div>
                    {list.map((m) => {
                      const active = m.model_id === modelId;
                      const isRecommended = m.model_id === RECOMMENDED_MODEL_ID;
                      const hint = modelHint(m);
                      const HintIcon = hint.icon;
                      return (
                        <button
                          key={m.model_id}
                          type="button"
                          onClick={() => pickModel(m.model_id)}
                          className={`w-full flex items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                            active
                              ? "bg-violet-500/10 ring-1 ring-violet-500/40"
                              : "hover:bg-muted/60"
                          }`}
                          role="option"
                          aria-selected={active}
                        >
                          <span className="mt-0.5 shrink-0">
                            {active ? (
                              <Check className="size-4 text-violet-500" />
                            ) : (
                              <span className="size-4 inline-block" aria-hidden />
                            )}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-medium text-foreground truncate">
                                {m.display_name}
                              </span>
                              {isRecommended && (
                                <span className="text-[9px] uppercase tracking-wider rounded px-1 py-0 bg-violet-500/15 text-violet-600 dark:text-violet-400 font-semibold">
                                  Consigliato
                                </span>
                              )}
                            </span>
                            <span
                              className={`mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${TONE_BG[hint.tone]}`}
                            >
                              <HintIcon className="size-2.5" />
                              {hint.tag}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums pt-0.5">
                            {m.credits_cost} cr
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {cost != null && (
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                Costo:{" "}
                <span className="font-semibold text-foreground">
                  {cost} {cost === 1 ? "credito" : "crediti"}
                </span>
              </span>
            )}
            <Button
              type="button"
              onClick={generate}
              disabled={busy || noModels}
              className="gap-2 bg-violet-500 hover:bg-violet-600 text-white h-10 px-4"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hasAnalyses ? (
                <RefreshCw className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {hasAnalyses ? "Rigenera analisi" : "Genera analisi"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
