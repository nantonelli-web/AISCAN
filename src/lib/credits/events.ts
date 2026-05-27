// Client-side notification that the credit balance may have changed.
//
// Credits are consumed server-side (scans, AI analysis, reports). After a
// client action that hits a credit-spending endpoint succeeds, call
// `notifyCreditsChanged()` so any mounted balance indicator (the sidebar
// CreditBadge) can refetch immediately instead of showing a stale value.
//
// NB: this only covers changes triggered *within the current browser session*.
// Cross-session changes (e.g. an admin granting credits from another browser)
// are handled separately by the badge refetching on tab focus.

export const CREDITS_CHANGED_EVENT = "credits:changed";

/** Dispatch after a client action that may have changed the credit balance. */
export function notifyCreditsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT));
}

/** Subscribe to credit-change notifications. Returns an unsubscribe fn. */
export function onCreditsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CREDITS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CREDITS_CHANGED_EVENT, handler);
}
