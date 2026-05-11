"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  X,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Square as SquareIcon,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * BatchScanGoogleModal — modal per lanciare uno scan Google Ads
 * simultaneamente su piu' brand selezionati. Safety controls a 4
 * livelli:
 *
 *  1. Client-side cap: max 10 brand selezionabili. Sopra disabilitiamo
 *     ulteriori check.
 *  2. Cost preview: l'utente vede esattamente quanti crediti
 *     spendera' prima di confermare.
 *  3. Server-side checks (vedi /api/apify/scan-google/batch): daily
 *     cost cap, cooldown 6h per brand, concurrency cap workspace 8.
 *  4. Polling batch status post-launch: aggiorna in real-time il
 *     conteggio running/succeeded/partial/failed.
 */

const MAX_BATCH = 10;
const CREDITS_PER_SCAN = 2;

interface BrandRow {
  id: string;
  page_name: string | null;
  google_advertiser_id: string | null;
  google_domain: string | null;
  last_scraped_at: string | null;
}

interface BatchResponse {
  ok?: boolean;
  batch_id?: string | null;
  error?: string;
  started?: Array<{
    competitor_id: string;
    job_id: string;
    page_name: string | null;
  }>;
  skipped?: Array<{
    competitor_id: string;
    page_name: string | null;
    reason: string;
    detail?: string;
  }>;
  summary?: {
    requested: number;
    launched: number;
    skipped: number;
    credits_charged: number;
  };
}

interface BatchStatusResponse {
  batch_id: string;
  counts: {
    total: number;
    running: number;
    succeeded: number;
    partial: number;
    failed: number;
  };
  total_records: number;
  terminal: boolean;
}

function reasonLabel(r: string): string {
  switch (r) {
    case "no_google_config":
      return "Senza Google Advertiser ID o dominio";
    case "recent_scan":
      return "Scansionato di recente";
    case "already_running":
      return "Scan gia' in corso";
    case "start_failed":
      return "Errore avvio scan";
    case "concurrency_cap":
      return "Limite scan paralleli raggiunto";
    default:
      return r;
  }
}

export function BatchScanGoogleModal({
  brands,
  onClose,
}: {
  brands: BrandRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<BatchStatusResponse | null>(
    null,
  );

  // Filtri client-side: solo brand con config Google.
  const googleBrands = useMemo(
    () =>
      brands.filter(
        (b) => !!(b.google_advertiser_id || b.google_domain),
      ),
    [brands],
  );

  const selectedList = useMemo(
    () => googleBrands.filter((b) => selected.has(b.id)),
    [googleBrands, selected],
  );

  const totalCost = selectedList.length * CREDITS_PER_SCAN;
  const overLimit = selectedList.length > MAX_BATCH;
  const canSubmit =
    selectedList.length > 0 && !overLimit && !submitting && !batchId;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const next = new Set<string>();
    for (const b of googleBrands.slice(0, MAX_BATCH)) next.add(b.id);
    setSelected(next);
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function submit() {
    if (!canSubmit) return;
    const ok = window.confirm(
      `Stai per lanciare uno scan Google Ads su ${selectedList.length} brand.\n\nCosto totale: ${totalCost} crediti.\n\nLo scan parte in background e ti aggiorneremo qui dentro a completion.\n\nProcedere?`,
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/apify/scan-google/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_ids: Array.from(selected),
          max_items: 500,
        }),
      });
      const j = (await res.json()) as BatchResponse;
      if (!res.ok) {
        toast.error(j.error ?? "Batch failed");
        return;
      }
      if (!j.batch_id || !j.started?.length) {
        // Nessuno scan partito (tutti skippati): mostra il dettaglio
        const skipReasons = (j.skipped ?? [])
          .map((s) => `${s.page_name ?? s.competitor_id}: ${reasonLabel(s.reason)}`)
          .join("; ");
        toast.error(
          `Nessuno scan lanciato. ${skipReasons || "(motivo non specificato)"}`,
          { duration: 10000 },
        );
        return;
      }
      const skippedCount = j.summary?.skipped ?? 0;
      toast.success(
        `Batch avviato: ${j.summary?.launched ?? 0} scan partiti${skippedCount > 0 ? `, ${skippedCount} brand skippati` : ""}.`,
      );
      setBatchId(j.batch_id);
      setPolling(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // Polling batch status
  useEffect(() => {
    if (!polling || !batchId) return;
    let cancelled = false;
    const POLL_MS = 8000;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(
          `/api/apify/scan-google/batch?batch_id=${batchId}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as BatchStatusResponse;
        setPollResult(j);
        if (j.terminal) {
          setPolling(false);
          const msg = `Batch completato: ${j.counts.succeeded} success, ${j.counts.partial} parziali, ${j.counts.failed} falliti, ${j.total_records} ads totali.`;
          toast.success(msg, { duration: 15000 });
          router.refresh();
          return;
        }
        if (!cancelled) setTimeout(poll, POLL_MS);
      } catch (e) {
        console.warn("[batch poll]", e);
        if (!cancelled) setTimeout(poll, POLL_MS);
      }
    }
    const h = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [polling, batchId, router]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-10 rounded-lg bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
              <Layers className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">
                Batch scan Google Ads
              </h2>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">
                Seleziona fino a {MAX_BATCH} brand. Lo scan parte in
                background, puoi chiudere il modal e tornare quando vuoi —
                aggiorneremo il riepilogo qui dentro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-md grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* Stato post-launch */}
        {batchId && pollResult && (
          <div className="px-5 py-3 border-b border-border bg-violet-500/5">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-violet-500">
              {polling ? "Batch in esecuzione" : "Batch completato"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]">
              <span>
                <strong>{pollResult.counts.running}</strong> in corso
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                <strong>{pollResult.counts.succeeded}</strong> ok
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                <strong>{pollResult.counts.partial}</strong> parziali
              </span>
              <span className="text-red-500">
                <strong>{pollResult.counts.failed}</strong> falliti
              </span>
              <span className="text-muted-foreground">
                · <strong>{pollResult.total_records}</strong> ads salvati
              </span>
            </div>
          </div>
        )}

        {/* Body: lista brand */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {googleBrands.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" />
              Nessun brand del workspace ha un Google Advertiser ID o dominio configurato. Aggiungili dalla pagina del singolo brand.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">
                  {googleBrands.length} brand disponibili
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-violet-500 hover:underline"
                    disabled={!!batchId}
                  >
                    Seleziona primi {MAX_BATCH}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={!!batchId}
                  >
                    Deseleziona tutti
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {googleBrands.map((b) => {
                  const isSelected = selected.has(b.id);
                  const hoursAgo = b.last_scraped_at
                    ? Math.round(
                        (Date.now() - new Date(b.last_scraped_at).getTime()) /
                          3_600_000,
                      )
                    : null;
                  const recentScan = hoursAgo !== null && hoursAgo < 6;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => !batchId && toggle(b.id)}
                        disabled={!!batchId}
                        className={`w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${
                          isSelected
                            ? "border-violet-500/40 bg-violet-500/10"
                            : "border-border hover:bg-muted/60"
                        } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-violet-500 shrink-0" />
                        ) : (
                          <SquareIcon className="size-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="flex-1 truncate font-medium">
                          {b.page_name ?? "(senza nome)"}
                        </span>
                        {recentScan && (
                          <span className="text-[10.5px] text-amber-600 dark:text-amber-400">
                            scansionato {hoursAgo}h fa
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer: cost + submit */}
        <footer className="flex items-center justify-between gap-3 p-5 border-t border-border bg-muted/20">
          <div className="text-[12px]">
            {batchId ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Batch lanciato. Stato sopra.
              </span>
            ) : overLimit ? (
              <span className="text-red-500">
                Max {MAX_BATCH} brand per batch (ne hai selezionati{" "}
                {selectedList.length})
              </span>
            ) : (
              <>
                <strong>{selectedList.length}</strong> brand selezionati ·
                Costo:{" "}
                <strong>
                  {totalCost} {totalCost === 1 ? "credito" : "crediti"}
                </strong>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              {batchId ? "Chiudi" : "Annulla"}
            </Button>
            <Button
              onClick={submit}
              disabled={!canSubmit}
              className="bg-violet-500 hover:bg-violet-600 text-white gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Avvio…
                </>
              ) : (
                <>
                  <Layers className="size-4" />
                  Scansiona ({selectedList.length})
                </>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
