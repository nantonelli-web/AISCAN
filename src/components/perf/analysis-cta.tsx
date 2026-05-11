"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * AnalysisCta — pannello "Genera analisi AI" in cima e in fondo al
 * dashboard import. Il modello LLM e' scelto da una lista letta da
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

/** Etichette user-friendly per il chip provider. */
const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  meta: "Meta",
};

function providerLabel(p: string): string {
  return PROVIDER_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

export function AnalysisCta({
  importId,
  hasAnalyses,
  position,
  onGenerated,
  /** Forwardiamo lo stato comparison del dashboard per coerenza
   *  delle analisi (se l'utente ha filtrato per week, l'analisi
   *  riguarda solo quella week). */
  compareParams,
}: {
  importId: string;
  hasAnalyses: boolean;
  position: "top" | "bottom";
  onGenerated: () => void;
  compareParams?: Record<string, string>;
}) {
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState<string | null>(() =>
    loadStoredModelId(),
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Fetch catalogo modelli attivi dall'Admin.
  useEffect(() => {
    let alive = true;
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((j: { models?: AiModel[] }) => {
        if (!alive) return;
        const list = j.models ?? [];
        setModels(list);
        // Se il model_id salvato non esiste piu' nel catalogo,
        // selezioniamo il primo (lista gia' ordinata per costo ASC
        // dall'API). Stesso fallback se non c'e' nulla in storage.
        const stored = loadStoredModelId();
        if (!stored || !list.some((m) => m.model_id === stored)) {
          if (list[0]) {
            setModelId(list[0].model_id);
            saveModelId(list[0].model_id);
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

  // Chiudi il popover su click outside.
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

  // Raggruppa modelli per provider per il popover (preserva l'ordine
  // costo ASC restituito dall'API: ogni gruppo mantiene il proprio
  // ordine interno).
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
          toast.error(j.error ?? "Generazione fallita");
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

        <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-violet-500/15">
          <div className="flex items-center gap-2 min-w-0 relative">
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
                  <span className="text-violet-500 truncate max-w-[200px]">
                    {selected.display_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {selected.credits_cost} cr
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
            {open && grouped.length > 0 && (
              <div
                ref={popoverRef}
                className="absolute left-0 top-full mt-1.5 z-50 w-[320px] max-h-[360px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-1"
                role="listbox"
              >
                {grouped.map(([provider, list]) => (
                  <div key={provider} className="py-1">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {providerLabel(provider)}
                    </div>
                    {list.map((m) => {
                      const active = m.model_id === modelId;
                      return (
                        <button
                          key={m.model_id}
                          type="button"
                          onClick={() => pickModel(m.model_id)}
                          className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                            active
                              ? "bg-violet-500/15 text-foreground"
                              : "hover:bg-muted/60 text-foreground"
                          }`}
                          role="option"
                          aria-selected={active}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {active ? (
                              <Check className="size-3.5 text-violet-500 shrink-0" />
                            ) : (
                              <span className="size-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="truncate font-medium">
                              {m.display_name}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
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
