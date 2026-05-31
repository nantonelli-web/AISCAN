"use client";

import { useEffect, useRef, useState } from "react";
import { hasActiveScanSignal } from "@/lib/scan/activity";

/**
 * Polling client-side che invoca /api/apify/scan-google/poll-active
 * ogni ~10s mentre l'utente ha aperta una pagina del dashboard.
 *
 * Sostituisce la finalizzazione via webhook Apify che — sui Rental
 * actor (silva95gustavo/google-ads-scraper) — Apify decide di non
 * invocare affidabilmente (Last dispatch: Never sulla console).
 *
 * Comportamento:
 *  - Tab in foreground: ogni 10s
 *  - Tab in background: pausato (visibilitychange)
 *  - Refresh: ricomincia
 *
 * Mostra un mini badge in basso a destra con lo stato del polling
 * (solo durante il debug — si nasconde se il backend dice "0 job da
 * controllare" per oltre 60s). Errori vanno a console.warn.
 * Montato in `src/app/(dashboard)/layout.tsx` cosi e' attivo su
 * tutte le pagine del dashboard.
 */
interface TickResult {
  ts: number;
  ok: boolean;
  status?: number;
  checked?: number;
  triggered?: Array<{ job_id: string; action: string; apify_status: string | null }>;
  error?: string;
}

export function ScanPoller() {
  const inFlight = useRef(false);
  const [lastResult, setLastResult] = useState<TickResult | null>(null);
  const [tickCount, setTickCount] = useState(0);

  useEffect(() => {
    console.log("[ScanPoller] mounted, polling every 10s");
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!active) return;
      if (document.hidden) {
        timer = setTimeout(tick, 30_000);
        return;
      }
      // No scan in flight in this session → make ZERO network calls.
      // Just re-check the local signal periodically (cheap, local-only),
      // so we start polling within ~15s of a scan launch. This is the
      // fix for the "every user polls every 10s forever" background load.
      if (!hasActiveScanSignal()) {
        timer = setTimeout(tick, 15_000);
        return;
      }
      if (inFlight.current) {
        timer = setTimeout(tick, 10_000);
        return;
      }
      inFlight.current = true;
      const ts = Date.now();
      try {
        const res = await fetch("/api/apify/scan-google/poll-active", {
          method: "GET",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          checked?: number;
          triggered?: TickResult["triggered"];
          error?: string;
        };
        console.log(
          `[ScanPoller] tick #${tickCount + 1}: status=${res.status} checked=${body.checked ?? 0} triggered=${body.triggered?.length ?? 0}`,
          body.triggered ?? [],
        );
        setLastResult({
          ts,
          ok: res.ok,
          status: res.status,
          checked: body.checked,
          triggered: body.triggered,
          error: body.error,
        });
        setTickCount((c) => c + 1);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[ScanPoller] tick failed:", msg);
        setLastResult({ ts, ok: false, error: msg });
      } finally {
        inFlight.current = false;
      }
      if (active) timer = setTimeout(tick, 10_000);
    }

    timer = setTimeout(tick, 1_000);

    function onVisibilityChange() {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(tick, 1_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Badge visibile solo se ci sono job da controllare (checked > 0)
  // oppure se il polling sta fallendo. Si nasconde quando l'idle e'
  // pulito per non distrarre.
  const shouldShow =
    lastResult != null &&
    ((lastResult.checked ?? 0) > 0 || !lastResult.ok);

  if (!shouldShow) return null;

  const timeStr = lastResult
    ? new Date(lastResult.ts).toLocaleTimeString()
    : "—";
  const triggeredCount = lastResult?.triggered?.length ?? 0;
  const checked = lastResult?.checked ?? 0;
  const tone = !lastResult?.ok
    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
    : triggeredCount > 0
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-border bg-muted/80 text-muted-foreground";
  return (
    <div
      className={`fixed bottom-3 right-3 z-50 rounded-md border px-2.5 py-1.5 text-[11px] font-mono backdrop-blur-md ${tone}`}
      title="ScanPoller — finalize Google Ads stuck"
    >
      {!lastResult?.ok ? (
        <>poll {lastResult?.status ?? "ERR"} · {lastResult?.error ?? "fail"}</>
      ) : (
        <>
          {timeStr} · checked {checked} · triggered {triggeredCount}
        </>
      )}
    </div>
  );
}
