"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, CalendarRange, Square, Search, MapPin, Info, Pencil } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeShortcuts, defaultPresets } from "@/components/ui/date-range-shortcuts";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hasSnapAdsCoverage } from "@/lib/snapchat/eu-countries";
import { notifyCreditsChanged } from "@/lib/credits/events";

/* ─── Platform SVG logos ─────────────────────────────────── */
// GoogleIcon vive in @/components/ui/google-icon — usato qui con
// colored=true cosi il pulsante Google Ads ha il logo brand
// multicolor invece di un'icona neutra.

/* ─── Helpers ────────────────────────────────────────────── */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${f.toLocaleDateString("it-IT", opts)} — ${t.toLocaleDateString("it-IT", opts)}`;
}

const MAX_RANGE_DAYS = 90;

/* ─── Component ──────────────────────────────────────────── */

interface Props {
  competitorId: string;
  /** True iff the brand has a Facebook page URL (or pre-resolved
   *  page_id) configured. Required for the Meta scan path: without
   *  one the Apify Meta actor has nothing to query. Mirrors the
   *  hasGoogleConfig / hasInstagramConfig pattern so the button
   *  disables visually + the missing-config strip can name the gap. */
  hasMetaConfig: boolean;
  hasGoogleConfig: boolean;
  hasInstagramConfig: boolean;
  hasTiktokConfig: boolean;
  hasSnapchatConfig: boolean;
  hasYoutubeConfig: boolean;
  /** Comma-separated ISO-2 country codes from the brand row
   *  (`mait_competitors.country`). Drives the per-ad
   *  scan_countries array on the Meta scrape and is shown as a
   *  read-only chip strip in the Scan now card so the user sees
   *  which markets the next scan will target. */
  scanCountries: string | null;
  /** DB-confirmed running job; shows Stop even after a page reload. */
  hasRunningJob?: boolean;
  /** Job 'running' partito >35 min fa con apify_run_id valorizzato:
   *  il run Apify e' sicuramente finito (timeoutSecs=30min cap) ma
   *  il webhook non e' mai arrivato (es. env vars deployate dopo lo
   *  start). Mostra banner ambra con bottone "Recupera dati" cosi
   *  l'utente puo' triggerare manualmente il reconcile. */
  hasOrphanRunningJob?: boolean;
  /** Timestamp dell'ultimo scan Google completato (succeeded o
   *  partial). Se entro 24h dal click su "Scan Google", chiediamo
   *  conferma all'utente prima di bruciare di nuovo i crediti. */
  googleLastScanAt?: string | null;
  /** Ultimo job Google in stato 'partial' che ha un runId Apify
   *  utilizzabile per resurrect. Se presente, il dropdown mostra un
   *  CTA "Continua scan" che riprende il run da dove si era fermato
   *  invece di iniziarne uno nuovo. */
  googlePartialJob?: {
    jobId: string;
    runId: string;
    recordsCount: number;
    completedAt: string | null;
  } | null;
  /** Ultimo job Google succeeded/partial con dataset Apify ancora
   *  disponibile (entro retention ~7 giorni). Permette di
   *  riprocessare i dati gia' pagati senza fare un nuovo scan. */
  googleRefinalizableJob?: {
    jobId: string;
    recordsCount: number;
  } | null;
}

// Loading-state discriminator. Paid+organic Snapchat live on the
// same brand-detail tab ("snapchat"), but the spinner needs to know
// which scan is in flight — so the paid scan keeps its own value
// here even though it focuses the same tab when done.
type ScanTarget =
  | "meta"
  | "google"
  | "tiktok_ads"
  | "snapchat_ads"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube";

export function ScanDropdown({
  competitorId,
  hasMetaConfig,
  hasGoogleConfig,
  hasInstagramConfig,
  scanCountries,
  hasTiktokConfig,
  hasSnapchatConfig,
  hasYoutubeConfig,
  hasRunningJob = false,
  hasOrphanRunningJob = false,
  googleLastScanAt = null,
  googlePartialJob = null,
  googleRefinalizableJob = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // After a successful scan we push `?tab=<channel>` so the brand
  // page lands on the just-imported channel instead of leaving the
  // user on the previous tab. router.replace + router.refresh keeps
  // the back-stack clean and re-runs the server component.
  function focusChannel(
    tab:
      | "meta"
      | "google"
      | "tiktok_ads"
      | "instagram"
      | "tiktok"
      | "snapchat"
      | "youtube",
  ) {
    router.replace(`${pathname}?tab=${tab}`);
    router.refresh();
  }
  const { t } = useT();
  const [loading, setLoading] = useState<ScanTarget | null>(null);
  const [stopping, setStopping] = useState(false);
  /** Job-id Google async in attesa di webhook. Quando settato,
   *  l'useEffect dedicato fa polling su /api/apify/jobs/{id}/status
   *  ogni 8s finche' non e' terminal (succeeded/partial/failed). */
  const [googleScanJobId, setGoogleScanJobId] = useState<string | null>(null);
  const googleScanToastIdRef = useRef<string | number | null>(null);

  // Shared date range
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Removed jumpToDateInput auto-jump from From → To: showPicker()
  // inside a setTimeout loses the user-activation gesture, leaving
  // the To picker in a frozen state where clicks/keys do not register
  // and click-outside does not close it. User can click To manually
  // — minor UX regression, much better than a stuck calendar.

  const isLoading = loading !== null;
  const showStop = isLoading || hasRunningJob;
  const abortRef = useRef<AbortController | null>(null);

  // Snap's Ads Library is an EU-only DSA endpoint — non-EU codes
  // return HTTP 400 from the API, so we gate the CTA when the brand
  // has explicit markets configured AND none of them are EU. When the
  // brand has no markets at all, the scan API falls back to all EU-27
  // by default, so we leave the button enabled in that case.
  const scanCountryList = (scanCountries ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const hasExplicitMarkets = scanCountryList.length > 0;
  const snapchatAdsAvailable =
    !hasExplicitMarkets || hasSnapAdsCoverage(scanCountryList);

  async function stopScan() {
    setStopping(true);
    // 1. Abort the client-side fetch if we own it
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // 2. Abort Apify run + mark job failed server-side. This also catches
    //    orphan runs started in a previous session (page reload case).
    try {
      await fetch("/api/apify/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
      toast.info(t("scan", "scanStopped"));
    } catch {
      toast.error("Stop failed");
    } finally {
      setLoading(null);
      setStopping(false);
      // Reset del polling Google async (l'abort triggera comunque
      // il webhook che marchera' il job come failed, ma noi smettiamo
      // di pollare subito per UX).
      if (googleScanJobId) {
        setGoogleScanJobId(null);
        if (googleScanToastIdRef.current) {
          toast.dismiss(googleScanToastIdRef.current);
          googleScanToastIdRef.current = null;
        }
      }
      router.refresh();
    }
  }

  // Polling per scan Google async. Si attiva quando scanGoogle() lancia
  // il run e ottiene un job_id; finisce quando il webhook ha aggiornato
  // lo status del job nel DB.
  useEffect(() => {
    if (!googleScanJobId) return;
    let cancelled = false;
    const pollStartedAt = Date.now();
    const POLL_MS = 8000;
    const MAX_MS = 35 * 60 * 1000;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/apify/jobs/${googleScanJobId}/status`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as {
          status: string;
          records_count: number;
          error: string | null;
          terminal: boolean;
        };
        if (j.terminal) {
          if (googleScanToastIdRef.current) {
            toast.dismiss(googleScanToastIdRef.current);
            googleScanToastIdRef.current = null;
          }
          if (j.status === "succeeded") {
            toast.success(
              `${j.records_count} Google Ads ${t("scan", "adsSynced")} (${rangeLabel})`,
            );
          } else if (j.status === "partial") {
            toast.success(
              `${j.records_count} Google Ads sincronizzate (scan parziale, ${rangeLabel})`,
              { duration: 10000 },
            );
          } else {
            toast.error(
              `Google Ads scan failed: ${j.error ?? "errore"}`,
              { duration: 10000 },
            );
          }
          setGoogleScanJobId(null);
          setLoading(null);
          focusChannel("google");
          return;
        }
        if (Date.now() - pollStartedAt > MAX_MS) {
          if (googleScanToastIdRef.current) {
            toast.dismiss(googleScanToastIdRef.current);
            googleScanToastIdRef.current = null;
          }
          toast.error(
            "Scan Google in corso da piu' di 35 minuti — controlla manualmente",
            { duration: 10000 },
          );
          setGoogleScanJobId(null);
          setLoading(null);
          return;
        }
        if (!cancelled) setTimeout(poll, POLL_MS);
      } catch (e) {
        console.warn("[scanGoogle poll]", e);
        if (!cancelled) setTimeout(poll, POLL_MS);
      }
    }
    const handle = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleScanJobId]);

  // Effective range: custom or last 30 days
  const effectiveFrom = dateFrom || daysAgo(30);
  const effectiveTo = dateTo || new Date().toISOString().slice(0, 10);
  const rangeLabel = formatRange(effectiveFrom, effectiveTo);

  // Date range validation
  const rangeDays = Math.round(
    (new Date(effectiveTo).getTime() - new Date(effectiveFrom).getTime()) / 86_400_000
  );
  const rangeExceeded = rangeDays > MAX_RANGE_DAYS;
  const rangeError = rangeExceeded
    ? `Max ${MAX_RANGE_DAYS} ${t("scan", "days")}`
    : null;

  // ─── Scan handlers ───

  async function scanMeta() {
    if (rangeExceeded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("meta");
    const toastId = toast.loading(t("scan", "scrapingInProgress"));
    try {
      const res = await fetch("/api/apify/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 500,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        if (json.debug) console.log("[AISCAN scan debug]", json.debug);
        toast.success(`${json.records} Meta Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        notifyCreditsChanged();
        focusChannel("meta");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  async function refinalizeGoogleScan() {
    if (!googleRefinalizableJob?.jobId) return;
    const ok = window.confirm(
      `Riprocessare il dataset Apify dello scan Google piu' recente?\n\nNON viene fatto un nuovo scan e non vengono spesi crediti: il dataset e' gia' stato pagato e Apify lo conserva per circa 7 giorni. Riprocessandolo ora i dati gia' raccolti vengono normalizzati e salvati di nuovo con la logica corrente.\n\nUsa questa funzione dopo modifiche alla normalizzazione/filtri (es. quando ti aspetti piu' ads salvati di quanti ne risultano in DB).`,
    );
    if (!ok) return;
    const toastId = toast.loading("Riprocesso dataset Apify…");
    try {
      const res = await fetch("/api/apify/scan-google/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job_id: googleRefinalizableJob.jobId,
          force_refinalize: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Refinalize failed", { id: toastId });
        return;
      }
      const r = (j.reconciled ?? [])[0] as
        | { outcome: string; records_count?: number; page_name: string | null }
        | undefined;
      if (!r) {
        toast.error("Nessun risultato dal reconcile", { id: toastId });
        return;
      }
      if (r.outcome === "still_running") {
        toast.info("Lo scan e' ancora in corso su Apify, riprova quando finisce", { id: toastId });
        return;
      }
      toast.success(
        `Dataset riprocessato: ${r.records_count ?? 0} ads ora in DB`,
        { id: toastId, duration: 12000 },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    }
  }

  async function reconcileGoogleScan() {
    const ok = window.confirm(
      "Forza il recupero dei dati per lo scan Google in corso?\n\nServe quando lo scan e' partito senza webhook configurato (es. dopo aver settato APIFY_WEBHOOK_SECRET): controlliamo direttamente Apify, se ha finito recuperiamo gli ads e finalizziamo il job.",
    );
    if (!ok) return;
    const toastId = toast.loading("Reconcile scan Google in corso…");
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
        page_name: string | null;
        message?: string;
      }>;
      if (list.length === 0) {
        toast.info("Nessun job da riconciliare trovato", { id: toastId });
        return;
      }
      const lines = list
        .map((r) => {
          const name = r.page_name ?? "(brand)";
          if (r.outcome === "finalized_succeeded")
            return `✓ ${name}: ${r.records_count} ads salvati`;
          if (r.outcome === "finalized_partial")
            return `~ ${name}: ${r.records_count} ads (parziale)`;
          if (r.outcome === "finalized_failed")
            return `✗ ${name}: failed (crediti rifondati)`;
          if (r.outcome === "still_running")
            return `· ${name}: ancora in corso su Apify`;
          return `? ${name}: ${r.outcome}`;
        })
        .join(" — ");
      toast.success(`Reconcile: ${lines}`, { id: toastId, duration: 15000 });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    }
  }

  async function resumeGoogleScan() {
    if (!googlePartialJob?.jobId) return;
    const ok = window.confirm(
      `Vuoi riprendere lo scan parziale di Google Ads?\n\nL'attore Apify riaprira' il run dallo stato in cui era stato interrotto (queue conservata) e continuera' a scrappare. Verra' addebitato il costo di un nuovo scan (2 crediti).`,
    );
    if (!ok) return;
    setLoading("google");
    const toastId = toast.loading(
      "Riprendo lo scan parziale — puoi continuare a lavorare",
    );
    googleScanToastIdRef.current = toastId;
    try {
      const res = await fetch("/api/apify/scan-google/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: googlePartialJob.jobId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Resume failed", { id: toastId });
        googleScanToastIdRef.current = null;
        setLoading(null);
        return;
      }
      // Attiva il polling come per un nuovo scan: il webhook arrivera'
      // a completion e cambiera' lo status del job.
      // Il costo (2 crediti) e' gia' addebitato dalla POST: notifica subito.
      notifyCreditsChanged();
      setGoogleScanJobId(googlePartialJob.jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
      googleScanToastIdRef.current = null;
      setLoading(null);
    }
  }

  async function scanGoogle() {
    if (rangeExceeded) return;
    // Cache check: se questo brand e' stato scansionato (anche
    // parziale) negli ultimi 24h chiediamo conferma cosi non bruciamo
    // 2 crediti su uno scan che probabilmente ritornera' gli stessi
    // dati. Soglia 24h e' un default sensato: i brand non aggiornano
    // la propria libreria pubblicitaria piu' frequentemente.
    if (googleLastScanAt) {
      const hoursAgo =
        (Date.now() - new Date(googleLastScanAt).getTime()) / 3_600_000;
      if (hoursAgo < 24) {
        const formatted =
          hoursAgo < 1
            ? `${Math.round(hoursAgo * 60)} minuti`
            : `${Math.round(hoursAgo)} ore`;
        const ok = window.confirm(
          `Questo brand e' stato scansionato ${formatted} fa.\n\nForzare un nuovo scan ti costera' 2 crediti aggiuntivi. La libreria pubblicitaria di Google difficilmente cambia cosi di frequente — la maggior parte dei brand pubblica nuovi ad ogni qualche settimana.\n\nProcedere comunque?`,
        );
        if (!ok) return;
      }
    }
    // Async flow: la POST ritorna in <2s con un job_id. Il polling
    // (useEffect sopra) si occupa di mostrare il toast finale quando
    // Apify chiama il webhook e il job diventa terminal.
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("google");
    const toastId = toast.loading(
      `${t("scan", "scrapingGoogleInProgress")} — puoi continuare a lavorare, ti avviseremo`,
    );
    googleScanToastIdRef.current = toastId;
    try {
      const res = await fetch("/api/apify/scan-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 500,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Google Ads scrape failed", { id: toastId });
        googleScanToastIdRef.current = null;
        setLoading(null);
        return;
      }
      if (!json.job_id) {
        toast.error("Risposta inattesa: no job_id", { id: toastId });
        googleScanToastIdRef.current = null;
        setLoading(null);
        return;
      }
      // Warning se al lancio il webhook non era configurato: l'utente
      // dovra' usare 'Recupera dati' al termine perche' il flow async
      // non funzionera' (Apify non ci chiamera').
      if (json.webhooks_configured === false) {
        toast.warning(
          "Scan partito ma SENZA webhook (env vars non disponibili al deploy). Al termine usa 'Recupera dati' per finalizzare.",
          { duration: 15000 },
        );
      }
      // Da qui in poi gestisce tutto il polling useEffect. Non
      // resettiamo setLoading: il pulsante deve restare 'loading'
      // finche' il webhook ha terminato.
      // Il costo (2 crediti) e' gia' addebitato dalla POST: notifica subito.
      notifyCreditsChanged();
      setGoogleScanJobId(json.job_id);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", {
          id: toastId,
        });
      }
      googleScanToastIdRef.current = null;
      setLoading(null);
    } finally {
      abortRef.current = null;
    }
  }

  // Snapchat Ads — Snap's official public REST API
  // (adsapi.snapchat.com), no Apify. Date range is forwarded; the
  // server applies a 12-month cap that matches Snap's own coverage.
  async function scanSnapchatAds() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("snapchat_ads");
    const toastId = toast.loading(t("scan", "scrapingInProgress"));
    try {
      const res = await fetch("/api/snapchat-ads/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          date_from: effectiveFrom,
          date_to: effectiveTo,
          status: "ACTIVE",
          max_results: 500,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Snapchat Ads scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} Snapchat Ads ${t("scan", "adsSynced")}`,
          { id: toastId },
        );
        notifyCreditsChanged();
        // Land on the Snapchat tab (paid + organic share it). There
        // is no dedicated "snapchat_ads" tab on the brand page —
        // mirror of the tiktok_ads handler which also routes to the
        // unified TikTok tab.
        focusChannel("snapchat");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  async function scanTiktokAds() {
    // DSA library scan — silva95gustavo actor. Brand-specific
    // (filters by adv_name + optional advertiser ID). Date window
    // inherited from the period inputs above.
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("tiktok_ads");
    const toastId = toast.loading(t("scan", "scrapingTikTokAdsInProgress"));
    try {
      const res = await fetch("/api/tiktok-ads/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "library",
          competitor_id: competitorId,
          date_from: effectiveFrom,
          date_to: effectiveTo,
          max_results: 200,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "TikTok Ads scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} TikTok Ads ${t("scan", "adsSynced")}`,
          { id: toastId },
        );
        notifyCreditsChanged();
        focusChannel("tiktok_ads");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  async function scanInstagram() {
    if (rangeExceeded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("instagram");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/instagram/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_posts: 100,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Instagram scrape failed", { id: toastId });
      } else if (json.records === 0) {
        // Smart 0-record message: distinguish private/wrong-handle
        // (rawCount = 0) from "no posts in window" (rawCount > 0
        // but all dropped by the date filter). Without this the
        // user sees a bare "0 posts" toast and can't tell whether
        // the brand is silent or the handle is wrong.
        const diag = json.diagnostics ?? { rawCount: 0, droppedOlder: 0, droppedNewer: 0 };
        if (diag.rawCount === 0) {
          toast.warning(t("organic", "scanZeroNoFeed"), { id: toastId });
        } else {
          toast.warning(
            t("organic", "scanZeroOutOfWindow")
              .replace("{raw}", String(diag.rawCount))
              .replace("{older}", String(diag.droppedOlder)),
            { id: toastId },
          );
        }
        notifyCreditsChanged();
        focusChannel("instagram");
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")} (${rangeLabel})`,
          { id: toastId }
        );
        notifyCreditsChanged();
        focusChannel("instagram");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  // YouTube: actor pulls latest N videos with no server-side
  // date filter, but we forward date_from/date_to so the route
  // can apply the window post-fetch and persist it on the job
  // row (chip in scan history then renders DD/MM → DD/MM, same
  // as the paid + Instagram scans). User feedback 2026-05-04.
  async function scanYoutube() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("youtube");
    const toastId = toast.loading(t("organic", "scanningYoutube"));
    try {
      const res = await fetch("/api/youtube/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_videos: 30,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "YouTube scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")}`,
          { id: toastId },
        );
        notifyCreditsChanged();
        focusChannel("youtube");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  // The Snapchat actor returns one profile snapshot per scan (no per-
  // post entity to filter, no date range). Always-on, regardless of
  // the date inputs above.
  async function scanSnapchat() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("snapchat");
    const toastId = toast.loading(t("organic", "scanningSnapchat"));
    try {
      const res = await fetch("/api/snapchat/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Snapchat scrape failed", { id: toastId });
      } else {
        toast.success(t("scan", "snapshotSynced"), { id: toastId });
        notifyCreditsChanged();
        focusChannel("snapchat");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  // TikTok: actor pulls latest N posts with no server-side filter,
  // but we forward the date range so the route can drop posts
  // outside [date_from, date_to] before insertion + persist the
  // window on the job row. Behaviour matches the YouTube scan
  // and the rest of the channel chips in the scan history.
  async function scanTikTok() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("tiktok");
    const toastId = toast.loading(t("organic", "scanningTikTok"));
    try {
      const res = await fetch("/api/tiktok/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_posts: 50,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "TikTok scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")}`,
          { id: toastId }
        );
        notifyCreditsChanged();
        focusChannel("tiktok");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  // ─── Render ───

  // Channel buttons: h-10 / text-sm / size-4 icons. Big enough to
  // read from a normal viewing distance, small enough that 4 fit
  // comfortably in an Organic column on a wide screen. The previous
  // h-9 + abbreviated labels (IG / YT / Snap) were the user-flagged
  // illegibility — full names are back.
  const btn = "h-10 px-3 text-sm gap-2 cursor-pointer w-full justify-start";
  // Disabled buttons need to be visually subtler than the active
  // ones — user feedback 2026-05-04: opacity-40 was still legible
  // and indistinguishable from active at a glance. We now combine
  // a stronger opacity drop, a dashed border (signals "not yet
  // configured"), and a lighter background so the eye reads them
  // as ghost states, not as primary CTAs.
  const btnDisabled =
    "h-10 px-3 text-sm gap-2 w-full justify-start opacity-50 cursor-not-allowed " +
    "!bg-muted/30 !border-dashed !border-border/60 !text-muted-foreground/60";

  return (
    <div className="space-y-5">
      {/* ─── 1. Scan period — its own row with proper label.
              The user reads it as a config setting, not as a sibling
              of the channel buttons. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pb-4 border-b border-border/60">
        <div className="inline-flex items-center gap-2 shrink-0">
          <div className="size-7 rounded-md bg-info-soft tone-info grid place-items-center">
            <CalendarRange className="size-4" />
          </div>
          <span className="text-sm font-medium text-foreground">
            {t("scan", "scanPeriod")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder={daysAgo(30)}
            aria-label={t("scan", "dateFrom")}
            className="text-sm h-9 w-40"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label={t("scan", "dateTo")}
            className="text-sm h-9 w-40"
          />
        </div>
        {/* One-click date-range presets — most users want "last 30
            days" 90% of the time, the manual two-date dance was
            friction. Highlights when current values match a preset. */}
        <DateRangeShortcuts
          presets={defaultPresets((s, k) => t(s, k))}
          activeFrom={dateFrom}
          activeTo={dateTo}
          onPick={(r) => { setDateFrom(r.from); setDateTo(r.to); }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        )}
        {rangeError && (
          <span className="text-xs tone-danger">{rangeError}</span>
        )}
      </div>

      {/* Helper note "Limiti per canale" spostata in coda allo
          ScanDropdown 2026-05-18 (richiesta utente): non e' info di
          gating al click, e' un dettaglio tecnico di lettura che
          appartiene meglio al fondo del blocco Scan dopo "Canali
          da configurare" — meno noise above-the-fold. */}

      {/* ─── 1b. Scan markets — chip strip + helper + pencil edit.
              I paesi vengono presi dall'ANAGRAFICA brand (campo
              mait_competitors.country). Modifica via pencil che
              porta al /edit del brand cosi la propagazione e' a
              unica fonte di verita' (no inline edit). */}
      {scanCountries && scanCountries.trim() && (
        <div className="pb-4 border-b border-border/60 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="inline-flex items-center gap-2 shrink-0">
              <div className="size-7 rounded-md bg-info-soft tone-info grid place-items-center">
                <MapPin className="size-4" />
              </div>
              <span className="text-sm font-medium text-foreground">
                {t("scan", "scanMarkets")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {scanCountries
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean)
                .map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums"
                  >
                    {code}
                  </span>
                ))}
            </div>
            <Link
              href={`/brands/${competitorId}/edit?from=scan&focus=countries`}
              className="ml-auto inline-flex items-center justify-center size-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title={t("scan", "scanMarketsEdit")}
              aria-label={t("scan", "scanMarketsEdit")}
            >
              <Pencil className="size-3.5" />
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground pl-9">
            {t("scan", "scanMarketsHelp")}
          </p>
        </div>
      )}

      {/* ─── 2. Stop button + scanning banner — visible whenever a
              scan is in flight on the client OR already running in
              the DB (survives a reload). The channel buttons below
              are hidden in this state so the user cannot accidentally
              fire a second scan while one is running. */}
      {/* Banner job non finalizzato: 'running' >35 min con apify_run_id
          valorizzato. Il run Apify e' sicuramente finito (timeoutSecs
          cap 30 min) ma il webhook non e' arrivato (es. env vars
          settate dopo lo start). Bottone Recupera dati triggera il
          reconcile endpoint. */}
      {hasOrphanRunningJob && !showStop && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Scan Google non finalizzato
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {"Lo scan e' partito piu' di 35 minuti fa: probabilmente Apify ha gia' finito ma noi non abbiamo ricevuto il callback. Clicca per recuperare i dati gia' raccolti."}
            </p>
          </div>
          <Button
            onClick={reconcileGoogleScan}
            variant="outline"
            size="sm"
            className="shrink-0 bg-background border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white hover:border-amber-500 gap-2"
          >
            <RefreshCw className="size-4" />
            Recupera dati
          </Button>
        </div>
      )}

      {showStop && (
        <div className="rounded-md border border-red-400/30 bg-red-400/5 p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("scan", "scanInProgressTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("scan", "scanInProgressHelp")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={reconcileGoogleScan}
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              title="Forza il recupero dati se lo scan Apify e' finito ma il webhook non e' arrivato"
            >
              <RefreshCw className="size-3.5" />
              Recupera dati
            </Button>
            <Button
              onClick={stopScan}
              disabled={stopping}
              variant="outline"
              size="lg"
              className={cn("h-10 px-4 gap-2 cursor-pointer border-red-400/40 text-red-400 hover:bg-red-400/15 hover:border-red-400")}
            >
              <Square className="size-5 fill-current" />
              {stopping ? t("scan", "stopping") : "Stop"}
            </Button>
          </div>
        </div>
      )}

      {/* Banner resume: c'e' uno scan Google partial pendente che
          puo' essere ripreso via Apify resurrect. Mostrato solo se
          non c'e' uno scan in corso (showStop=false) — altrimenti il
          banner Stop ha la priorita'. */}
      {!showStop && googlePartialJob && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="size-8 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
            <GoogleIcon className="size-4" colored />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Scan Google parziale disponibile
            </p>
            <p className="text-[12px] text-muted-foreground">
              {`Hai gia' ${googlePartialJob.recordsCount} ads salvati da uno scan precedente che si era interrotto. Puoi riprenderlo da dove era arrivato (2 crediti).`}
            </p>
          </div>
          <Button
            onClick={resumeGoogleScan}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="shrink-0 bg-background border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white hover:border-amber-500"
          >
            {loading === "google" ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Continua scan
          </Button>
        </div>
      )}

      {/* ─── 3. Channels — 3-column grid, each column is one
              category (Paid / Organic / Monitoring). Each column
              has a clear group header (eyebrow + thin colour rule)
              and stacks its buttons vertically so the full channel
              name fits and the touch target is large.
              On narrow widths the grid collapses to a single column
              so nothing gets cramped. */}
      {!showStop && (
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          {/* PAID column — gold rail (matches the channel-rail
              token system used on cards elsewhere). */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[color:var(--channel-meta)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                {t("scan", "paid")}
              </span>
            </div>
            {/* PAID has 4 channels now (Meta / Google / TikTok Ads /
                Snapchat Ads) — same 2x2 mini-grid as the ORGANIC
                column so the heights line up. */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={hasMetaConfig ? scanMeta : undefined}
                disabled={!hasMetaConfig || isLoading || rangeExceeded}
                variant="outline"
                size="sm"
                className={hasMetaConfig ? btn : btnDisabled}
              >
                {loading === "meta" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <MetaIcon className="size-4" colored />
                )}
                {loading === "meta" ? t("scan", "scanning") : "Meta Ads"}
              </Button>
              <Button
                onClick={hasGoogleConfig ? scanGoogle : undefined}
                disabled={!hasGoogleConfig || isLoading || rangeExceeded}
                variant="outline"
                size="sm"
                className={hasGoogleConfig ? btn : btnDisabled}
              >
                {loading === "google" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon className="size-4" colored />
                )}
                {loading === "google" ? t("scan", "scanningGoogle") : "Google Ads"}
              </Button>
              {/* TikTok Ads — DSA Library scrape (silva95gustavo).
                  Brand-specific by adv_name; works even when the
                  advertiser ID isn't set on the brand record. */}
              <Button
                onClick={scanTiktokAds}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className={btn}
              >
                {loading === "tiktok_ads" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <TikTokIcon className="size-4" colored />
                )}
                {loading === "tiktok_ads" ? t("scan", "scanning") : "TikTok Ads"}
              </Button>
              {/* Snapchat Ads — Snap's official public DSA API. Free,
                  no Apify, no token. EU-only by API design, so we
                  also gate the CTA when the brand's configured markets
                  contain zero EU country (the API returns 400 in that
                  case). Tooltip + inline note below clarify the why
                  so the user doesn't read it as a bug. */}
              <Button
                onClick={
                  snapchatAdsAvailable ? scanSnapchatAds : undefined
                }
                disabled={isLoading || !snapchatAdsAvailable}
                variant="outline"
                size="sm"
                className={snapchatAdsAvailable ? btn : btnDisabled}
                title={
                  !snapchatAdsAvailable
                    ? t("scan", "snapchatAdsNoEuMarkets")
                    : undefined
                }
              >
                {loading === "snapchat_ads" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <SnapchatIcon className="size-4" colored />
                )}
                {loading === "snapchat_ads" ? t("scan", "scanning") : "Snapchat Ads"}
              </Button>
            </div>
            {/* Visible explanation strip — shown only when the
                Snapchat Ads button is gated. We surface this here
                instead of in a tooltip alone so the user understands
                the reason without having to hover the disabled
                button. Same warning tone as the missing-config strip
                at the bottom of the panel. */}
            {!snapchatAdsAvailable && (
              <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed">
                <Info className="size-3.5 tone-warning shrink-0 mt-0.5" />
                <p className="tone-warning">
                  <span className="font-medium">
                    {t("scan", "snapchatAdsGatedTitle")}
                  </span>{" "}
                  <span className="text-foreground/80">
                    {t("scan", "snapchatAdsGatedBody")}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* ORGANIC column — 4 channels stacked in 2x2 mini-grid
              so the column doesn't get tall and uneven against
              the 2-button Paid column. */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[color:var(--channel-instagram)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                {t("scan", "organic")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={hasInstagramConfig ? scanInstagram : undefined}
                disabled={!hasInstagramConfig || isLoading || rangeExceeded}
                variant="outline"
                size="sm"
                className={hasInstagramConfig ? btn : btnDisabled}
              >
                {loading === "instagram" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <InstagramIcon className="size-4" colored />
                )}
                Instagram
              </Button>
              <Button
                onClick={hasTiktokConfig ? scanTikTok : undefined}
                disabled={!hasTiktokConfig || isLoading}
                variant="outline"
                size="sm"
                className={hasTiktokConfig ? btn : btnDisabled}
              >
                {loading === "tiktok" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <TikTokIcon className="size-4" colored />
                )}
                TikTok
              </Button>
              <Button
                onClick={hasSnapchatConfig ? scanSnapchat : undefined}
                disabled={!hasSnapchatConfig || isLoading}
                variant="outline"
                size="sm"
                className={hasSnapchatConfig ? btn : btnDisabled}
              >
                {loading === "snapchat" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <SnapchatIcon className="size-4" colored />
                )}
                Snapchat
              </Button>
              <Button
                onClick={hasYoutubeConfig ? scanYoutube : undefined}
                disabled={!hasYoutubeConfig || isLoading}
                variant="outline"
                size="sm"
                className={hasYoutubeConfig ? btn : btnDisabled}
              >
                {loading === "youtube" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <YouTubeIcon className="size-4" colored />
                )}
                YouTube
              </Button>
            </div>
          </div>

          {/* MONITORING column — workspace-level tools (SERP / Maps)
              don't have a "scan" action per se — clicking opens the
              create flow on the workspace page with brand context
              preserved. */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[color:var(--channel-serp)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                {t("scan", "monitoringGroup")}
              </span>
            </div>
            <div className="space-y-2">
              <Link
                href={`/serp?brandId=${competitorId}&new=1`}
                className={cn(
                  btn,
                  "inline-flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Search className="size-4" /> Google SERP
              </Link>
              <Link
                href="/maps"
                className={cn(
                  btn,
                  "inline-flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <MapPin className="size-4" /> Google Maps
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. Missing config — collapsed into a single inline row.
              The previous amber box stacked one row per missing channel
              and ate ~120px on a typical brand. The icon-only chips
              with a single "Configura" link convey the same info in
              ~32px and keep the Scan card compact. */}
      {!showStop && (() => {
        const missing = [
          !hasMetaConfig && "Meta",
          !hasGoogleConfig && "Google",
          !hasInstagramConfig && "Instagram",
          !hasTiktokConfig && "TikTok",
          !hasSnapchatConfig && "Snapchat",
          !hasYoutubeConfig && "YouTube",
        ].filter(Boolean) as string[];
        if (missing.length === 0) return null;
        return (
          <div className="flex items-center gap-2 flex-wrap text-xs tone-warning bg-warning-soft rounded-md px-3 py-2">
            <span className="font-medium">
              {missing.length === 1
                ? t("scan", "configRequiredOne")
                : `${missing.length} ${t("scan", "configRequiredMany")}`}
              :
            </span>
            <span className="text-foreground/80">{missing.join(", ")}</span>
            <a
              href={`/brands/${competitorId}/edit?from=brand`}
              className="ml-auto text-xs underline tone-warning hover:opacity-80"
            >
              {t("compare", "goToEdit")}
            </a>
          </div>
        );
      })()}

      {/* Refinalize affordance: piccolo link discreto se c'e' un job
          Google recente (entro 6 giorni) con dataset Apify ancora
          disponibile. Permette di riprocessare i dati gia' pagati
          senza un nuovo scan — utile dopo modifiche alla logica di
          normalizzazione/filtri. */}
      {!showStop && googleRefinalizableJob && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={refinalizeGoogleScan}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1"
            title="Riprocessa il dataset Apify dell'ultimo scan Google senza pagare un nuovo scan"
          >
            <RefreshCw className="size-3" />
            Riprocessa dataset ultimo scan ({googleRefinalizableJob.recordsCount} ads attualmente in DB)
          </button>
        </div>
      )}

      {/* ─── Limiti per canale — note tecnica di lettura, vive in
              fondo dopo "Canali da configurare" (richiesta utente
              2026-05-18). TikTok / YouTube non hanno filtro data
              lato actor; Snapchat Ads usa la DSA Snap (recupera
              EU/12 mesi). Sta giu' perche non gate i click, e' solo
              info di interpretazione. */}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <p>
          <span className="font-medium text-foreground">{t("scan", "tiktokYoutubeNoteTitle")}</span>{" "}
          {t("scan", "tiktokYoutubeNoteBody")}
        </p>
      </div>
    </div>
  );
}
