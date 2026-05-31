/**
 * Active-scan signal for the client-side ScanPoller.
 *
 * The poller exists to finalize Google Ads scans (the Rental actor's
 * webhook is unreliable). Previously it polled the API every 10s on
 * EVERY dashboard page for EVERY user, even with no scan running — pure
 * background load that scales with users-online, not scans-active.
 *
 * With this signal the poller only hits the API while a scan is actually
 * in flight in this browser:
 *  - the batch panel persists `aiscan.batch.id` for the duration of a batch;
 *  - single scans call markScanActivity() which sets a short-lived window.
 * When neither is present the poller makes zero network calls.
 */
const ACTIVE_UNTIL_KEY = "aiscan.scan.activeUntil";
const BATCH_ID_KEY = "aiscan.batch.id";
// Covers a single scan's expected wall-clock (Apify run + finalize).
const WINDOW_MS = 8 * 60_000;

/** Call when launching a scan that the poller should finalize. */
export function markScanActivity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ACTIVE_UNTIL_KEY,
      String(Date.now() + WINDOW_MS),
    );
  } catch {
    /* localStorage unavailable (private mode etc.) — poller falls back
       to its idle re-check; no crash. */
  }
}

/** True if a scan is plausibly in flight and the poller should run. */
export function hasActiveScanSignal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(BATCH_ID_KEY)) return true;
    const until = Number(window.localStorage.getItem(ACTIVE_UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}
