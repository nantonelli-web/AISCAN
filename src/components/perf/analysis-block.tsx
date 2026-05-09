"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Save, X as XIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AnalysisBlock — render del testo AI per una specifica sezione
 * del dashboard Adv Performance. Sotto il blocco grafico/tabella
 * di riferimento. Supporta:
 * - empty state ("Nessuna analisi: genera col CTA in alto/in
 *   basso alla pagina")
 * - testo discorsivo + meta info (modello / edited)
 * - icona matita per entrare in modalita' edit (textarea)
 * - save / annulla edit (PATCH /api/perf/imports/[id]/analysis/[section])
 *
 * Il componente NON triggera la generazione AI da solo (quello e'
 * il job del CTA top/bottom). Si limita a mostrare cio' che la
 * pagina parent ha gia' caricato.
 */

export interface SectionAnalysis {
  section: string;
  content: string;
  model_tier: string;
  model_id: string | null;
  edited_by_user: boolean;
  updated_at: string;
}

export function AnalysisBlock({
  importId,
  section,
  analysis,
  onUpdated,
}: {
  importId: string;
  section: string;
  analysis: SectionAnalysis | null;
  /** Chiamato dopo save/discard cosi il parent rifresca la lista. */
  onUpdated: (next: SectionAnalysis | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(analysis?.content ?? "");
  const [saving, setSaving] = useState(false);

  if (!analysis && !editing) {
    return null;
  }

  function startEdit() {
    setDraft(analysis?.content ?? "");
    setEditing(true);
  }

  async function save() {
    if (!draft.trim()) {
      toast.error("Il testo non puo' essere vuoto");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/perf/imports/${importId}/analysis/${section}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: draft.trim() }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Salvataggio fallito");
        return;
      }
      const updated: SectionAnalysis = {
        section,
        content: draft.trim(),
        model_tier: analysis?.model_tier ?? "pragmatic",
        model_id: analysis?.model_id ?? null,
        edited_by_user: true,
        updated_at: new Date().toISOString(),
      };
      onUpdated(updated);
      setEditing(false);
      toast.success("Analisi aggiornata");
    } finally {
      setSaving(false);
    }
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 print:bg-transparent print:border-violet-500/40">
      <div className="flex items-start gap-3">
        <div className="size-7 rounded-md bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
          <Sparkles className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10.5px] uppercase tracking-wider text-violet-500 font-semibold">
              Analisi AI
              {analysis.edited_by_user && (
                <span className="ml-2 text-muted-foreground/80 normal-case font-normal text-[10px]">
                  · modificata manualmente
                </span>
              )}
            </p>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted print:hidden"
                title="Modifica testo"
                aria-label="Modifica testo analisi"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-2 print:hidden">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(4, Math.min(20, draft.split("\n").length + 2))}
                className="w-full text-sm leading-relaxed rounded-md border border-border bg-background p-3 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  <XIcon className="size-3.5" />
                  Annulla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Salva
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {analysis.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
