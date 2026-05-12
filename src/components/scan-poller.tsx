"use client";

import { useEffect, useRef } from "react";

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
 * Non blocca la UI, non mostra niente. Errori vanno a console.
 * Montato in `src/app/(dashboard)/layout.tsx` cosi e' attivo su
 * tutte le pagine del dashboard.
 */
export function ScanPoller() {
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!active) return;
      if (document.hidden) {
        // Tab non visibile: ripianifica fra 30s per controllare se torna in foreground
        timer = setTimeout(tick, 30_000);
        return;
      }
      if (inFlight.current) {
        timer = setTimeout(tick, 10_000);
        return;
      }
      inFlight.current = true;
      try {
        await fetch("/api/apify/scan-google/poll-active", {
          method: "GET",
          cache: "no-store",
        });
      } catch (e) {
        // Network error: ok, riproveremo al prossimo tick.
        console.warn("[ScanPoller] tick failed:", e);
      } finally {
        inFlight.current = false;
      }
      if (active) timer = setTimeout(tick, 10_000);
    }

    // Avvia subito al mount, poi ogni 10s
    timer = setTimeout(tick, 1_000);

    function onVisibilityChange() {
      if (!document.hidden) {
        // Tab tornata in foreground: riavvia subito
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
  }, []);

  return null;
}
