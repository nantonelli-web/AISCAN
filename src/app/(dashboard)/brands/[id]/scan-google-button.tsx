"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { notifyCreditsChanged } from "@/lib/credits/events";

interface JobStatusResponse {
  job_id: string;
  status: string;
  records_count: number;
  error: string | null;
  terminal: boolean;
}

const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MINUTES = 35; // dopo 35 min lo consideriamo orfano

export function ScanGoogleButton({
  competitorId,
  hasGoogleConfig,
}: {
  competitorId: string;
  hasGoogleConfig: boolean;
}) {
  const router = useRouter();
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const { t } = useT();
  const toastIdRef = useRef<string | number | null>(null);
  const pollStartRef = useRef<number>(0);

  const loading = pendingJobId !== null;

  // Polling: una volta partito uno scan async, ogni POLL_INTERVAL_MS
  // chiediamo lo stato; quando terminal mostriamo il toast finale e
  // refreshiamo la pagina cosi l'utente vede i nuovi ads.
  useEffect(() => {
    if (!pendingJobId) return;
    let cancelled = false;
    pollStartRef.current = Date.now();

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/apify/jobs/${pendingJobId}/status`, {
          cache: "no-store",
        });
        if (!r.ok) {
          throw new Error(`Status fetch failed (${r.status})`);
        }
        const j = (await r.json()) as JobStatusResponse;
        if (j.terminal) {
          if (toastIdRef.current) toast.dismiss(toastIdRef.current);
          if (j.status === "succeeded") {
            toast.success(
              `${j.records_count} Google Ads ${t("scan", "adsSynced")}`,
            );
          } else if (j.status === "partial") {
            toast.success(
              `${j.records_count} Google Ads sincronizzate (scan parziale: il run e' stato interrotto ma i dati raccolti sono stati salvati)`,
              { duration: 10000 },
            );
          } else {
            toast.error(
              `Google Ads scan failed: ${j.error ?? "errore sconosciuto"}`,
              { duration: 10000 },
            );
          }
          setPendingJobId(null);
          router.refresh();
          return;
        }
        // Timeout di safety: se sforiamo 35 min senza terminal, smetto
        // di pollare. Il backend marchera' il job come stale al
        // prossimo trigger.
        if (Date.now() - pollStartRef.current > MAX_POLL_MINUTES * 60_000) {
          if (toastIdRef.current) toast.dismiss(toastIdRef.current);
          toast.error(
            "Scan in corso da piu' di 35 minuti — controlla manualmente lo stato",
            { duration: 10000 },
          );
          setPendingJobId(null);
          return;
        }
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        // Transient error: continuiamo a pollare. Loggiamo solo.
        console.warn("[ScanGoogleButton] poll error:", e);
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    const handle = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pendingJobId, router, t]);

  if (!hasGoogleConfig) return null;

  async function doScan() {
    toastIdRef.current = toast.loading(
      `${t("scan", "scrapingGoogleInProgress")} (puoi continuare a lavorare, ti avviseremo)`,
    );
    try {
      const res = await fetch("/api/apify/scan-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 500,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (toastIdRef.current) toast.dismiss(toastIdRef.current);
        toast.error(json.error ?? "Google Ads scrape failed");
        toastIdRef.current = null;
        return;
      }
      if (!json.job_id) {
        if (toastIdRef.current) toast.dismiss(toastIdRef.current);
        toast.error("Risposta inattesa dal server (no job_id)");
        toastIdRef.current = null;
        return;
      }
      // Il costo (2 crediti) e' gia' addebitato dalla POST: notifica subito.
      notifyCreditsChanged();
      setPendingJobId(json.job_id);
    } catch (e) {
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
      toast.error(e instanceof Error ? e.message : "Network error");
      toastIdRef.current = null;
    }
  }

  return (
    <Button onClick={doScan} disabled={loading} variant="outline">
      <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      {loading ? t("scan", "scanningGoogle") : t("scan", "scanGoogle")}
    </Button>
  );
}
