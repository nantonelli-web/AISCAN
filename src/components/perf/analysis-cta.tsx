"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * AnalysisCta — pannello "Genera analisi AI" che si mostra in
 * cima e in fondo al dashboard import. Espone:
 * - tier picker (cheap/pragmatic/premium) col tier consigliato
 *   evidenziato. Persistito in localStorage cosi e' coerente
 *   fra le visite.
 * - bottone "Genera" (prima volta) / "Rigenera" (analisi gia'
 *   presenti) con loading state.
 * - mostra cost in credits e label del modello sottostante.
 */

export type TierKey = "cheap" | "pragmatic" | "premium";

interface TierOption {
  key: TierKey;
  title: string;
  desc: string;
  cost: number;
  recommended?: boolean;
}

const TIER_OPTIONS: TierOption[] = [
  {
    key: "cheap",
    title: "Essenziale",
    desc: "Analisi rapida. DeepSeek V3.2.",
    cost: 1,
  },
  {
    key: "pragmatic",
    title: "Consigliato",
    desc: "Equilibrio qualita'/costo. Claude Haiku 4.5 — italiano nativo, ragionamento chiaro.",
    cost: 3,
    recommended: true,
  },
  {
    key: "premium",
    title: "Avanzato",
    desc: "Massima profondita'. Claude Sonnet 4.5 — analisi dettagliate, raccomandazioni piu' articolate.",
    cost: 8,
  },
];

const STORAGE_KEY = "aiscan.perf.tier";

function loadTier(): TierKey {
  if (typeof window === "undefined") return "pragmatic";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "cheap" || raw === "pragmatic" || raw === "premium") return raw;
  return "pragmatic";
}

function saveTier(t: TierKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, t);
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
  const [tier, setTier] = useState<TierKey>(() => loadTier());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function pickTier(t: TierKey) {
    setTier(t);
    saveTier(t);
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/perf/imports/${importId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tier,
          force_overwrite_edited: false,
          ...(compareParams ?? {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(
            `Crediti insufficienti (saldo: ${j.balance ?? "?"}). Tier: ${j.tier ?? tier}.`,
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
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  const selected = TIER_OPTIONS.find((o) => o.key === tier) ?? TIER_OPTIONS[1];

  return (
    <Card
      className={`print:hidden border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/3 to-transparent ${
        position === "bottom" ? "mt-2" : ""
      }`}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="size-10 rounded-lg bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold uppercase tracking-wider">
              Analisi AI {position === "top" ? "del periodo" : "— rigenera"}
            </h3>
            <p className="text-[11.5px] text-muted-foreground">
              {hasAnalyses
                ? "Analisi gia' presenti per questo dashboard. Rigenera con un nuovo modello o quando i dati cambiano. Le sezioni modificate manualmente vengono preservate."
                : "Genera commenti discorsivi per ogni blocco del dashboard, con motivazioni dei trend e suggerimenti operativi basati su best practice del paid advertising."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOpen((s) => !s)}
              className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Nascondi opzioni" : "Modello & opzioni"}
            </button>
            <Button
              type="button"
              size="sm"
              onClick={generate}
              disabled={busy}
              className="gap-1.5 bg-violet-500 hover:bg-violet-600 text-white"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hasAnalyses ? (
                <RefreshCw className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {hasAnalyses ? "Rigenera" : "Genera analisi"}
              <Badge
                variant="outline"
                className="ml-1 text-[10px] px-1.5 py-0 border-white/30 text-white/90 bg-white/10"
              >
                {selected.cost}cr
              </Badge>
            </Button>
          </div>
        </div>

        {open && (
          <div className="grid gap-2 sm:grid-cols-3 pt-2 border-t border-violet-500/20">
            {TIER_OPTIONS.map((opt) => {
              const active = opt.key === tier;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => pickTier(opt.key)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    active
                      ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/40"
                      : "border-border hover:border-violet-500/40 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold ${active ? "text-violet-500" : "text-foreground"}`}
                    >
                      {opt.title}
                    </span>
                    <div className="flex items-center gap-1">
                      {opt.recommended && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 text-amber-500 border-amber-500/40"
                        >
                          consigliato
                        </Badge>
                      )}
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          active
                            ? "bg-violet-500 text-white"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {opt.cost}cr
                      </span>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-snug mt-1">
                    {opt.desc}
                  </p>
                  {active && (
                    <p className="text-[10px] text-violet-500 mt-1 inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      Selezionato
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
