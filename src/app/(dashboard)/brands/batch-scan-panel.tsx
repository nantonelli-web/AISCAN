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
  RefreshCw,
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
// Costo crediti vive ora nei singoli ChannelOption.costPerScan
// — il batch usa quello dinamicamente per il totalCost preview.

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
  snapchat_handle: string | null;
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

type Channel =
  | "google"
  | "snapchat"
  | "meta"
  | "instagram"
  | "tiktok"
  | "youtube";

interface ChannelOption {
  key: Channel;
  label: string;
  available: boolean;
  costPerScan: number;
  /** Helper text quando non disponibile */
  comingNote?: string;
}

const CHANNELS: ChannelOption[] = [
  { key: "google", label: "Google Ads", available: true, costPerScan: 2 },
  {
    key: "snapchat",
    label: "Snapchat",
    available: true,
    costPerScan: 1,
  },
  {
    key: "meta",
    label: "Meta Ads",
    available: false,
    costPerScan: 5,
    comingNote:
      "Meta scan e' sync con timeout 5min — batch richiede refactor async (pipeline Apify start+webhook)",
  },
  {
    key: "instagram",
    label: "Instagram",
    available: false,
    costPerScan: 2,
    comingNote:
      "Batch IG in arrivo dopo refactor async (pipeline Apify start+webhook)",
  },
  {
    key: "tiktok",
    label: "TikTok",
    available: false,
    costPerScan: 2,
    comingNote:
      "Batch TT in arrivo dopo refactor async (pipeline Apify start+webhook)",
  },
  {
    key: "youtube",
    label: "YouTube",
    available: false,
    costPerScan: 1,
    comingNote:
      "Batch YT in arrivo dopo refactor async (pipeline Apify start+webhook)",
  },
];

function reasonLabel(r: string): string {
  switch (r) {
    case "no_config":
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
  switch (channel) {
    case "google":
      return !!(brand.google_advertiser_id || brand.google_domain);
    case "snapchat":
      return !!brand.snapchat_handle;
    case "meta":
    case "instagram":
    case "tiktok":
    case "youtube":
      return false; // batch non ancora supportato per questi canali
  }
}

function batchEndpointFor(channel: Channel): string | null {
  switch (channel) {
    case "google":
      return "/api/apify/scan-google/batch";
    case "snapchat":
      return "/api/snapchat/scan/batch";
    default:
      return null;
  }
}

export function BatchScanPanel({
  brands,
  clients,
  stuckJobsCount = 0,
}: {
  brands: BrandRow[];
  clients: ClientRow[];
  /** Numero di job Google del workspace in stato 'running' da >5min
   *  con apify_run_id valorizzato. Calcolato server-side in page.tsx.
   *  Se > 0 il pannello mostra un banner di recovery sempre visibile
   *  (anche dopo refresh, quando lo state del batchId interno e' perso). */
  stuckJobsCount?: number;
}) {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("google");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  // Canale del batch in corso. Necessario per il polling URL: ogni
  // canale ha il proprio endpoint /api/.../batch?batch_id=. Lo
  // salviamo separatamente da `channel` perche' l'utente potrebbe
  // cambiare canale dopo aver lanciato un batch ed il poll
  // continuerebbe a interrogare l'endpoint sbagliato.
  const [batchChannel, setBatchChannel] = useState<Channel | null>(null);
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

  // Brand filtrati per progetto (pre-canale). Usato sia per la lista
  // visibile sia per calcolare i conteggi per ogni canale.
  const brandsInProject = useMemo(() => {
    return brands.filter((b) => {
      if (clientFilter === null) return true;
      if (clientFilter === "_unassigned") return b.client_id === null;
      return b.client_id === clientFilter;
    });
  }, [brands, clientFilter]);

  // Conteggi per canale CALCOLATI dentro il progetto selezionato.
  // Driver primario della UI: se un canale ha 0 brand configurati nel
  // progetto, lo disabilitiamo (no scelta in vuoto). Il canale viene
  // dopo il progetto perche' senza progetto non sai chi puo' essere
  // scansionato.
  const channelCountsForProject = useMemo(() => {
    const counts: Record<Channel, number> = {
      google: 0,
      snapchat: 0,
      meta: 0,
      instagram: 0,
      tiktok: 0,
      youtube: 0,
    };
    for (const b of brandsInProject) {
      for (const k of Object.keys(counts) as Channel[]) {
        if (hasChannelConfig(b, k)) counts[k]++;
      }
    }
    return counts;
  }, [brandsInProject]);

  // Eligible brands: dentro il progetto + config per il canale corrente
  const eligibleBrands = useMemo(() => {
    return brandsInProject.filter((b) => hasChannelConfig(b, channel));
  }, [brandsInProject, channel]);

  const selectedList = useMemo(
    () => eligibleBrands.filter((b) => selected.has(b.id)),
    [eligibleBrands, selected],
  );

  const currentChannelMeta = CHANNELS.find((c) => c.key === channel);
  const costPerScan = currentChannelMeta?.costPerScan ?? 2;
  const totalCost = selectedList.length * costPerScan;
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
    if (channelCountsForProject[c] === 0) {
      toast.info(
        "Nessun brand del progetto selezionato ha la configurazione per questo canale.",
        { duration: 5000 },
      );
      return;
    }
    setChannel(c);
    // Cambio canale resetta selezione (un brand che ha Google config
    // potrebbe non avere TikTok config quindi e' piu' sicuro pulire).
    setSelected(new Set());
  }

  /**
   * Cambio progetto: ricalcola i canali validi e, se il canale
   * corrente non ha brand nel nuovo progetto, salta al primo canale
   * disponibile (Google → Snapchat → ...). Cosi' l'utente non resta
   * mai con lista vuota e UI muta.
   */
  function selectProject(filterValue: string | null) {
    setClientFilter(filterValue);
    setSelected(new Set());
    // Calcola counts per il nuovo filtro (non possiamo usare lo state
    // perche' setState e' async)
    const counts: Record<Channel, number> = {
      google: 0,
      snapchat: 0,
      meta: 0,
      instagram: 0,
      tiktok: 0,
      youtube: 0,
    };
    for (const b of brands) {
      if (filterValue !== null) {
        if (filterValue === "_unassigned" && b.client_id !== null) continue;
        if (filterValue !== "_unassigned" && b.client_id !== filterValue)
          continue;
      }
      for (const k of Object.keys(counts) as Channel[]) {
        if (hasChannelConfig(b, k)) counts[k]++;
      }
    }
    if (counts[channel] === 0) {
      const fallback = CHANNELS.find(
        (c) => c.available && counts[c.key] > 0,
      );
      if (fallback) setChannel(fallback.key);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    const endpoint = batchEndpointFor(channel);
    if (!endpoint) {
      toast.error("Canale non supportato nel batch");
      return;
    }
    setSubmitting(true);
    try {
      // Body differente per canale. Google: include max_items + range
      // (sono parametri di scrape). Snapchat: solo competitor_ids
      // (scan profilo, niente parametri di range).
      const body: Record<string, unknown> = {
        competitor_ids: Array.from(selected),
      };
      if (channel === "google") {
        body.max_items = 500;
        body.date_from = effectiveFrom;
        body.date_to = effectiveTo;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
      // Warning critico: i run sono partiti senza webhook config →
      // l'utente dovra' usare 'Recupera dati' al termine.
      const webhooksConfigured = (j as { webhooks_configured?: boolean })
        .webhooks_configured;
      if (webhooksConfigured === false) {
        toast.warning(
          "I run sono partiti SENZA webhook config (env vars non disponibili al deploy attivo). Al termine clicca 'Recupera dati' per finalizzare manualmente.",
          { duration: 15000 },
        );
      }
      setBatchId(j.batch_id);
      setBatchChannel(channel);
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

  async function reconcileBatch() {
    const ok = window.confirm(
      "Forza il recupero dei dati per tutti i job Google in attesa?\n\nServe quando Apify ha gia' completato i run ma noi non abbiamo ricevuto il webhook (es. il batch e' partito con config sbagliata o il browser e' stato refreshato). Andiamo direttamente su Apify, leggiamo lo stato di ogni run e finalizziamo i job — niente nuovi crediti spesi.",
    );
    if (!ok) return;
    setReconciling(true);
    const toastId = toast.loading("Reconcile job in corso…");
    try {
      const res = await fetch("/api/apify/scan-google/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Reconcile failed", { id: toastId });
        return;
      }
      const list = (j.reconciled ?? []) as Array<{
        outcome: string;
        records_count?: number;
      }>;
      const finalized = list.filter((r) =>
        r.outcome.startsWith("finalized"),
      ).length;
      const stillRunning = list.filter(
        (r) => r.outcome === "still_running",
      ).length;
      toast.success(
        `Reconcile: ${finalized} job finalizzati${stillRunning > 0 ? `, ${stillRunning} ancora in corso lato Apify` : ""}.`,
        { id: toastId, duration: 10000 },
      );
      // Se siamo dentro un batch attivo il polling raccogliera' il
      // nuovo status; altrimenti forziamo refresh della pagina cosi
      // il banner scompare e le card brand mostrano gli ads nuovi.
      if (!batchId) {
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    } finally {
      setReconciling(false);
    }
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
        const pollEndpoint = batchEndpointFor(batchChannel ?? "google");
        if (!pollEndpoint) return;
        const r = await fetch(
          `${pollEndpoint}?batch_id=${batchId}`,
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
  }, [batchId, batchChannel, pollResult?.terminal, router]);

  // Scroll into view quando si apre
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [open]);

  // Hooks-friendly: useMemo PRIMA di qualsiasi early return.
  // Brand con almeno 1 canale supportato configurato (Google o
  // Snapchat al momento). Usato sia per il gate di visibilita' del
  // panel sia per i conteggi del pill "Progetto".
  const brandsWithAnyChannel = useMemo(
    () =>
      brands.filter(
        (b) =>
          hasChannelConfig(b, "google") || hasChannelConfig(b, "snapchat"),
      ),
    [brands],
  );

  // Conteggio clients per pill "Progetto". Conta SOLO brand con
  // almeno un canale supportato — i brand senza config non sono
  // batchabili e non vanno mostrati nei contatori per progetto.
  const clientCountsAnyChannel = useMemo(() => {
    const m = new Map<string, number>();
    let unassigned = 0;
    for (const b of brandsWithAnyChannel) {
      if (b.client_id === null) unassigned++;
      else m.set(b.client_id, (m.get(b.client_id) ?? 0) + 1);
    }
    return { byId: m, unassigned, total: brandsWithAnyChannel.length };
  }, [brandsWithAnyChannel]);

  // Non mostrare il panel se non ci sono almeno 2 brand batchabili
  if (clientCountsAnyChannel.total < 2) return null;

  return (
    <Card
      ref={panelRef}
      className="border-amber-500/25 bg-gradient-to-br from-amber-500/[0.04] to-transparent"
    >
      <CardContent className="p-6 space-y-6">
        {/* Header con toggle. Quando c'e' un batch in corso, mostra
            inline il counter + dot pulsante anche se il pannello e'
            collassato — cosi' l'utente sa sempre se sta succedendo
            qualcosa. */}
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
              <Layers className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight">
                Batch scan multi-brand
              </h2>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
                {open
                  ? `Scansiona fino a ${MAX_BATCH} brand contemporaneamente. Scegli il progetto, il canale (Google Ads o Snapchat) e il periodo di scansione: i singoli scan partono in parallelo e girano in background — puoi chiudere il pannello e navigare altrove, ti notifichiamo quando ognuno completa. I crediti vengono addebitati solo per gli scan effettivamente avviati (cooldown 6h, max 8 paralleli per workspace).`
                  : `Lancia in parallelo fino a ${MAX_BATCH} scan da un solo click — utile dopo l'import di un nuovo progetto o al primo refresh settimanale. Apri per scegliere progetto, canale e periodo.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {batchId && pollResult && polling && (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-[11.5px] font-medium">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                </span>
                Batch in corso · {pollResult.counts.total - pollResult.counts.running}/{pollResult.counts.total}
              </span>
            )}
            {batchId && pollResult && !polling && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 text-[11.5px] font-medium">
                <CheckCircle2 className="size-3" />
                Batch completato
              </span>
            )}
            <span className="text-muted-foreground">
              {open ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </span>
          </div>
        </button>

        {/* Banner recovery server-side: se ci sono job Google stuck
            (running >5min con runId), mostriamo sempre il bottone
            "Recupera dati" — visibile anche dopo refresh quando lo
            state interno del batch e' perso. Indipendente da batchId. */}
        {stuckJobsCount > 0 && !batchId && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                {`${stuckJobsCount} scan Google in attesa di finalizzazione`}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                {"Sono partiti da piu' di 5 minuti ma il webhook Apify non e' arrivato. Probabilmente Apify ha gia' finito: clicca per recuperare i dati senza spendere nuovi crediti."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={reconcileBatch}
              disabled={reconciling}
              className="shrink-0 bg-background border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white hover:border-amber-500 gap-1.5"
            >
              {reconciling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Recupera dati
            </Button>
          </div>
        )}

        {open && (
          <>
            {/* Stato batch (post-launch): progress bar prominente,
                counter sobri, bottone Stop in bianco col bordo rosso
                cosi' contrasta sul viola del Card parent. */}
            {batchId && pollResult && (() => {
              const total = pollResult.counts.total;
              const completed =
                pollResult.counts.succeeded +
                pollResult.counts.partial +
                pollResult.counts.failed;
              const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        {polling
                          ? `Batch in esecuzione · ${percent}% (${completed}/${total})`
                          : `Batch completato · ${total} brand`}
                      </p>
                      {polling && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {`Stiamo aspettando ${pollResult.counts.running} run Apify. Aggiornamento ogni 8s.`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {polling && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={reconcileBatch}
                            disabled={reconciling || stopping}
                            className="h-8 gap-1.5"
                            title="Forza recupero dati dai run Apify gia' completati quando il webhook non arriva"
                          >
                            {reconciling ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                            Recupera dati
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={stopBatch}
                            disabled={stopping || reconciling}
                            className="h-8 bg-background border-red-500 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 gap-1.5"
                          >
                            {stopping ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Square className="size-3.5 fill-current" />
                            )}
                            {stopping ? "Fermo…" : "Stop batch"}
                          </Button>
                        </>
                      )}
                      {!polling && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={resetForNewBatch}
                          className="h-8"
                        >
                          Nuovo batch
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="h-2 w-full rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Avanzamento batch"
                  >
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Counter compatti: niente sfondi colorati, solo
                      tipografia + pallini-stato. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <strong className="text-foreground">
                        {pollResult.counts.succeeded}
                      </strong>{" "}
                      ok
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      <strong className="text-foreground">
                        {pollResult.counts.partial}
                      </strong>{" "}
                      parziali
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-red-500" />
                      <strong className="text-foreground">
                        {pollResult.counts.failed}
                      </strong>{" "}
                      falliti
                    </span>
                    {polling && pollResult.counts.running > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <strong className="text-foreground">
                          {pollResult.counts.running}
                        </strong>{" "}
                        in corso
                      </span>
                    )}
                    <span className="ml-auto">
                      <strong className="text-foreground">
                        {pollResult.total_records}
                      </strong>{" "}
                      ads salvati
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Riga filtri: PROGETTO prima, CANALE dopo (i canali sono
                proprieta' del brand → senza brand non puoi sapere quali
                canali sono validi). Il count di ciascun canale dipende
                dal progetto selezionato. */}
            <div className="space-y-5">
              {/* 1) Progetto */}
              {(clients.length > 0 || clientCountsAnyChannel.unassigned > 0) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Folder className="size-4 text-foreground" />
                    <span className="text-[12px] uppercase tracking-[0.08em] text-foreground font-bold">
                      Progetto
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => selectProject(null)}
                      disabled={!!batchId}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                        clientFilter === null
                          ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                          : "border-border hover:bg-muted/60 text-foreground"
                      } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Tutti
                      <span
                        className={
                          clientFilter === null
                            ? "text-[10px] text-amber-700/70 dark:text-amber-300/70"
                            : "text-[10px] text-muted-foreground"
                        }
                      >
                        {clientCountsAnyChannel.total}
                      </span>
                    </button>
                    {clients.map((c) => {
                      const count = clientCountsAnyChannel.byId.get(c.id) ?? 0;
                      if (count === 0) return null;
                      const active = clientFilter === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectProject(c.id)}
                          disabled={!!batchId}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                            active
                              ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
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
                          <span
                            className={
                              active
                                ? "text-[10px] text-amber-700/70 dark:text-amber-300/70"
                                : "text-[10px] text-muted-foreground"
                            }
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {clientCountsAnyChannel.unassigned > 0 && (
                      <button
                        type="button"
                        onClick={() => selectProject("_unassigned")}
                        disabled={!!batchId}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                          clientFilter === "_unassigned"
                            ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                            : "border-border hover:bg-muted/60 text-foreground"
                        } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        Senza progetto
                        <span
                          className={
                            clientFilter === "_unassigned"
                              ? "text-[10px] text-amber-700/70 dark:text-amber-300/70"
                              : "text-[10px] text-muted-foreground"
                          }
                        >
                          {clientCountsAnyChannel.unassigned}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 2) Canale — count e disabled state derivano dal progetto
                  scelto sopra. Se un canale non ha brand configurati nel
                  progetto, e' disabilitato (non in vuoto). */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Globe2 className="size-4 text-foreground" />
                  <span className="text-[12px] uppercase tracking-[0.08em] text-foreground font-bold">
                    Canale
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CHANNELS.map((c) => {
                    const countInProject = channelCountsForProject[c.key];
                    const usable = c.available && countInProject > 0;
                    const active = c.key === channel && usable;
                    const reason = !c.available
                      ? c.comingNote
                      : countInProject === 0
                        ? "Nessun brand del progetto ha la config per questo canale"
                        : undefined;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => changeChannel(c.key)}
                        disabled={!!batchId || !usable}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                          active
                            ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                            : usable
                              ? "border-border hover:bg-muted/60 text-foreground"
                              : "border-border/40 text-muted-foreground/60 cursor-not-allowed"
                        } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                        title={reason}
                      >
                        {c.label}
                        {c.available && (
                          <span
                            className={
                              active
                                ? "text-[10px] text-amber-700/70 dark:text-amber-300/70"
                                : "text-[10px] text-muted-foreground"
                            }
                          >
                            {countInProject}
                          </span>
                        )}
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
            </div>

            {/* Periodo di scansione (date range). Default vuoto =
                ultimi 30 giorni applicati al momento della submit.
                Su Google e' solo metadata storico sul job; su Meta
                (futuro async) sara' filtro alla fonte. */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <CalendarRange className="size-4 text-foreground" />
                <span className="text-[12px] uppercase tracking-[0.08em] text-foreground font-bold">
                  Periodo di scansione
                </span>
              </div>
              {/* Riga unica: input a sinistra, shortcuts a destra
                  cosi' usiamo tutto lo spazio orizzontale invece di
                  accatastare in verticale. flex-wrap permette ai
                  shortcuts di scendere sotto solo su viewport stretti. */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 shrink-0">
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
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
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
                  {(dateFrom || dateTo) && !batchId && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              {!dateFrom && !dateTo && (
                <p className="text-[11px] text-muted-foreground mt-2">
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
                      className="text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 cursor-pointer"
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
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-amber-500/10"
                              : "hover:bg-muted/60"
                          } ${batchId ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
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
            <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-amber-500/15">
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
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
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
