"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Square as SquareIcon,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Folder,
  Globe2,
  CalendarRange,
  Square,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateRangeShortcuts,
  defaultPresets,
} from "@/components/ui/date-range-shortcuts";
import { useT } from "@/lib/i18n/context";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Inline batch-scan panel.
 *
 * Collassabile: di default e' chiuso, l'utente lo apre col toggle nella
 * header del proprio Card. Quando aperto mostra:
 *  - select canale (oggi solo Google attivo, gli altri "presto" disabled)
 *  - pill row coi clients del workspace per filtrare i brand
 *  - lista brand checkbox-abile
 *  - footer con cost preview + bottone Lancia
 *  - post-launch: counters running/succeeded/partial/failed che si
 *    aggiornano via polling ogni 8s
 */

const MAX_BATCH = 10;
const CREDITS_PER_GOOGLE_SCAN = 2;

interface ClientRow {
  id: string;
  name: string;
  color: string | null;
}

interface BrandRow {
  id: string;
  page_name: string | null;
  client_id: string | null;
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

type Channel = "google" | "meta" | "tiktok_ads" | "snapchat_ads" | "instagram" | "tiktok" | "youtube";

interface ChannelOption {
  key: Channel;
  label: string;
  available: boolean;
  /** Helper text quando non disponibile */
  comingNote?: string;
}

const CHANNELS: ChannelOption[] = [
  { key: "google", label: "Google Ads", available: true },
  {
    key: "meta",
    label: "Meta Ads",
    available: false,
    comingNote: "Meta e' sync con timeout 5min — batch in arrivo dopo refactor async",
  },
  {
    key: "tiktok_ads",
    label: "TikTok Ads",
    available: false,
    comingNote: "Batch in arrivo dopo refactor async",
  },
  {
    key: "snapchat_ads",
    label: "Snapchat Ads",
    available: false,
    comingNote: "Batch in arrivo dopo refactor async",
  },
];

function reasonLabel(r: string): string {
  switch (r) {
    case "no_google_config":
      return "Senza config canale";
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

function hasChannelConfig(brand: BrandRow, channel: Channel): boolean {
  if (channel === "google") {
    return !!(brand.google_advertiser_id || brand.google_domain);
  }
  return false; // gli altri canali oggi non sono lanciabili in batch
}

export function BatchScanPanel({
  brands,
  clients,
}: {
  brands: BrandRow[];
  clients: ClientRow[];
}) {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("google");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [pollResult, setPollResult] = useState<BatchStatusResponse | null>(
    null,
  );
  // Date range del batch. Default vuoto → applichiamo "ultimi 30
  // giorni" alla submit (allineato al pattern dello scan singolo).
  // Su Google il range e' solo metadata sulla row del job (la
  // libreria pubblica viene salvata intera, vedi SCAN_DATE_BEHAVIOR.md
  // §2). Su Meta — quando lo porteremo async — il range diventera'
  // filtro alla fonte.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const effectiveFrom = dateFrom || daysAgo(30);
  const effectiveTo = dateTo || new Date().toISOString().slice(0, 10);

  // Eligible brands: hanno config per il canale selezionato + match il filtro client
  const eligibleBrands = useMemo(() => {
    return brands.filter((b) => {
      if (!hasChannelConfig(b, channel)) return false;
      if (clientFilter !== null) {
        if (clientFilter === "_unassigned" && b.client_id !== null) return false;
        if (clientFilter !== "_unassigned" && b.client_id !== clientFilter)
          return false;
      }
      return true;
    });
  }, [brands, channel, clientFilter]);

  const selectedList = useMemo(
    () => eligibleBrands.filter((b) => selected.has(b.id)),
    [eligibleBrands, selected],
  );

  const totalCost = selectedList.length * CREDITS_PER_GOOGLE_SCAN;
  const overLimit = selectedList.length > MAX_BATCH;
  const polling = batchId !== null && !pollResult?.terminal;
  const canSubmit =
    selectedList.length > 0 && !overLimit && !submitting && !polling;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFirstN() {
    const next = new Set<string>();
    for (const b of eligibleBrands.slice(0, MAX_BATCH)) next.add(b.id);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function changeChannel(c: Channel) {
    const target = CHANNELS.find((x) => x.key === c);
    if (!target || !target.available) {
      if (target?.comingNote) toast.info(target.comingNote, { duration: 6000 });
      return;
    }
    setChannel(c);
    // Cambio canale resetta selezione (un brand che ha Google config
    // potrebbe non avere TikTok config quindi e' piu' sicuro pulire).
    setSelected(new Set());
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/apify/scan-google/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_ids: Array.from(selected),
          max_items: 500,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
      });
      const j = (await res.json()) as BatchResponse;
      if (!res.ok) {
        toast.error(j.error ?? "Batch failed");
        return;
      }
      if (!j.batch_id || !j.started?.length) {
        const skipReasons = (j.skipped ?? [])
          .map(
            (s) =>
              `${s.page_name ?? s.competitor_id}: ${reasonLabel(s.reason)}`,
          )
          .join("; ");
        toast.error(
          `Nessuno scan lanciato. ${skipReasons || "(motivo non specificato)"}`,
          { duration: 10000 },
        );
        return;
      }
      const skippedCount = j.summary?.skipped ?? 0;
      toast.success(
        `Batch avviato: ${j.summary?.launched ?? 0} scan partiti${skippedCount > 0 ? `, ${skippedCount} skippati` : ""}.`,
      );
      setBatchId(j.batch_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNewBatch() {
    setBatchId(null);
    setPollResult(null);
    setSelected(new Set());
  }

  async function stopBatch() {
    if (!batchId) return;
    const ok = window.confirm(
      "Fermare il batch in corso?\n\nVengono abortiti i run Apify ancora in esecuzione. Gli ads gia' scrapati prima dell'abort vengono salvati comunque (status job 'partial'); i job senza ads vengono marcati 'failed' e i crediti rifondati automaticamente.",
    );
    if (!ok) return;
    setStopping(true);
    const toastId = toast.loading("Stop batch in corso…");
    try {
      const res = await fetch("/api/apify/scan-google/batch/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Stop batch failed", { id: toastId });
        return;
      }
      toast.success(
        `Stop richiesto: ${j.aborted_count ?? 0} run Apify abortiti. I parziali arrivano via webhook nei prossimi secondi.`,
        { id: toastId, duration: 10000 },
      );
      // Lasciamo che il polling esistente raccolga lo stato finale
      // dei job man mano che i webhook ABORTED arrivano.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    } finally {
      setStopping(false);
    }
  }

  // Polling status
  useEffect(() => {
    if (!batchId) return;
    if (pollResult?.terminal) return;
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
          toast.success(
            `Batch completato: ${j.counts.succeeded} ok, ${j.counts.partial} parziali, ${j.counts.failed} falliti, ${j.total_records} ads totali.`,
            { duration: 15000 },
          );
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
  }, [batchId, pollResult?.terminal, router]);

  // Scroll into view quando si apre
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [open]);

  // Hooks-friendly: useMemo PRIMA di qualsiasi early return.
  const totalGoogleEligible = useMemo(
    () => brands.filter((b) => hasChannelConfig(b, "google")).length,
    [brands],
  );

  // Conteggio clients che hanno almeno 1 brand col canale corrente
  const clientCountsForChannel = useMemo(() => {
    const m = new Map<string, number>();
    let unassigned = 0;
    for (const b of brands) {
      if (!hasChannelConfig(b, channel)) continue;
      if (b.client_id === null) unassigned++;
      else m.set(b.client_id, (m.get(b.client_id) ?? 0) + 1);
    }
    return { byId: m, unassigned };
  }, [brands, channel]);

  // Non mostrare il panel se non ci sono brand con config Google nel workspace
  if (totalGoogleEligible < 2) return null;

  return (
    <Card
      ref={panelRef}
      className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/3 to-transparent"
    >
      <CardContent className="p-5 space-y-4">
        {/* Header con toggle */}
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-violet-500/15 text-violet-500 grid place-items-center shrink-0">
              <Layers className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight">
                Batch scan multi-brand
              </h2>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">
                {open
                  ? `Seleziona fino a ${MAX_BATCH} brand da scansionare in parallelo. Lo scan parte in background, puoi navigare altrove.`
                  : "Lancia uno scan su piu' brand contemporaneamente."}
              </p>
            </div>
          </div>
          <span className="text-muted-foreground shrink-0">
            {open ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </span>
        </button>

        {open && (
          <>
            {/* Stato batch (post-launch) */}
            {batchId && pollResult && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-violet-500">
                    {polling ? "Batch in esecuzione" : "Batch completato"}
                  </p>
                  <div className="flex items-center gap-2">
                    {polling && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={stopBatch}
                        disabled={stopping}
                        className="text-[11px] h-7 border-red-400/40 text-red-500 hover:bg-red-400/15 hover:border-red-400 gap-1.5"
                      >
                        {stopping ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Square className="size-3 fill-current" />
                        )}
                        {stopping ? "Fermo…" : "Stop batch"}
                      </Button>
                    )}
                    {!polling && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetForNewBatch}
                        className="text-[11px] h-7"
                      >
                        Nuovo batch
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
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

            {/* Riga filtri: canale + cliente */}
            <div className="space-y-3">
              {/* Canale */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Globe2 className="size-3.5 text-muted-foreground" />
                  <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Canale
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CHANNELS.map((c) => {
                    const active = c.key === channel && c.available;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => changeChannel(c.key)}
                        disabled={!!batchId}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                          active
                            ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                            : c.available
                              ? "border-border hover:bg-muted/60 text-foreground"
                              : "border-border/40 text-muted-foreground/60 cursor-not-allowed line-through-none"
                        } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                        title={!c.available ? c.comingNote : undefined}
                      >
                        {c.label}
                        {!c.available && (
                          <span className="text-[9px] uppercase tracking-wider opacity-80">
                            presto
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cliente / Progetto */}
              {(clients.length > 0 ||
                clientCountsForChannel.unassigned > 0) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Folder className="size-3.5 text-muted-foreground" />
                    <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Progetto
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setClientFilter(null);
                        setSelected(new Set());
                      }}
                      disabled={!!batchId}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        clientFilter === null
                          ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                          : "border-border hover:bg-muted/60 text-foreground"
                      } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Tutti
                      <span className="text-[10px] text-muted-foreground">
                        {totalGoogleEligible}
                      </span>
                    </button>
                    {clients.map((c) => {
                      const count = clientCountsForChannel.byId.get(c.id) ?? 0;
                      if (count === 0) return null;
                      const active = clientFilter === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setClientFilter(c.id);
                            setSelected(new Set());
                          }}
                          disabled={!!batchId}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                            active
                              ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                              : "border-border hover:bg-muted/60 text-foreground"
                          } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: c.color ?? "#9ca3af",
                            }}
                            aria-hidden
                          />
                          {c.name}
                          <span className="text-[10px] text-muted-foreground">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {clientCountsForChannel.unassigned > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setClientFilter("_unassigned");
                          setSelected(new Set());
                        }}
                        disabled={!!batchId}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                          clientFilter === "_unassigned"
                            ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                            : "border-border hover:bg-muted/60 text-foreground"
                        } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        Senza progetto
                        <span className="text-[10px] text-muted-foreground">
                          {clientCountsForChannel.unassigned}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Periodo di scansione (date range). Default vuoto =
                ultimi 30 giorni applicati al momento della submit.
                Su Google e' solo metadata storico sul job; su Meta
                (futuro async) sara' filtro alla fonte. */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <CalendarRange className="size-3.5 text-muted-foreground" />
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Periodo di scansione
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder={daysAgo(30)}
                  aria-label="Da"
                  disabled={!!batchId}
                  className="text-sm h-9 w-40"
                />
                <span className="text-sm text-muted-foreground">→</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="A"
                  disabled={!!batchId}
                  className="text-sm h-9 w-40"
                />
                {(dateFrom || dateTo) && !batchId && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="mt-1.5">
                <DateRangeShortcuts
                  presets={defaultPresets((s, k) => t(s, k))}
                  activeFrom={dateFrom}
                  activeTo={dateTo}
                  onPick={(r) => {
                    if (batchId) return;
                    setDateFrom(r.from);
                    setDateTo(r.to);
                  }}
                />
              </div>
              {!dateFrom && !dateTo && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {`Default: ultimi 30 giorni (${effectiveFrom} → ${effectiveTo}). Il range verra' memorizzato come metadata su ogni job.`}
                </p>
              )}
            </div>

            {/* Lista brand */}
            {eligibleBrands.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                Nessun brand del filtro corrente ha la configurazione del
                canale selezionato.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">
                    {eligibleBrands.length} brand disponibili
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectFirstN}
                      className="text-violet-500 hover:underline disabled:opacity-50"
                      disabled={!!batchId}
                    >
                      Seleziona primi {MAX_BATCH}
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      disabled={!!batchId}
                    >
                      Deseleziona tutti
                    </button>
                  </div>
                </div>
                <ul className="max-h-[280px] overflow-y-auto rounded-md border border-border space-y-px bg-background">
                  {eligibleBrands.map((b) => {
                    const isSelected = selected.has(b.id);
                    const hoursAgo = b.last_scraped_at
                      ? Math.round(
                          (Date.now() -
                            new Date(b.last_scraped_at).getTime()) /
                            3_600_000,
                        )
                      : null;
                    const recentScan = hoursAgo !== null && hoursAgo < 6;
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => !batchId && toggleSelect(b.id)}
                          disabled={!!batchId}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors ${
                            isSelected
                              ? "bg-violet-500/10"
                              : "hover:bg-muted/60"
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
              </div>
            )}

            {/* Footer: cost + submit */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-violet-500/15">
              <div className="text-[12px]">
                {batchId ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {polling
                      ? "Batch in corso, puoi chiudere il pannello e navigare altrove"
                      : "Batch completato"}
                  </span>
                ) : overLimit ? (
                  <span className="text-red-500">
                    Max {MAX_BATCH} brand per batch (ne hai selezionati{" "}
                    {selectedList.length})
                  </span>
                ) : selectedList.length === 0 ? (
                  <span className="text-muted-foreground">
                    Seleziona almeno un brand dalla lista
                  </span>
                ) : (
                  <>
                    <strong>{selectedList.length}</strong> selezionati · Costo:{" "}
                    <strong>
                      {totalCost} {totalCost === 1 ? "credito" : "crediti"}
                    </strong>
                  </>
                )}
              </div>
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
                    Lancia batch ({selectedList.length})
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
