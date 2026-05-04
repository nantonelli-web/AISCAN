"use client";

import { Toaster } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

/**
 * AISCAN-themed toast container — wraps sonner's <Toaster> so the
 * notifications feel part of the product instead of a stock dark
 * pill.
 *
 * Implementation history (relevant context for the next dev):
 *
 *   v1 (commit 7d3e514) — relied on CSS rules in globals.css
 *   targeting `[data-sonner-toast].aiscan-toast`. Did NOT work in
 *   prod: sonner ships its own internal stylesheet that sets CSS
 *   variables (`--normal-bg`, `--success-bg`) via inline `style`
 *   attribute, which can outweigh selector-based rules even with
 *   `!important` because the variables resolve at a different
 *   point in the cascade. The user kept seeing the default
 *   black-pill toast.
 *
 *   v2 (this file) — drives every variant via Tailwind classes
 *   passed through `toastOptions.classNames`. Each class string
 *   is `!`-prefixed so it overrides sonner's inline style. We
 *   also pass explicit `icons` (lucide CheckCircle/XCircle/etc)
 *   so the auto-icon richColors used to give us is reproducible
 *   without enabling richColors (which fights our colour overrides).
 *
 * Behaviour encoded here:
 *   - position bottom-right (matches user expectation)
 *   - duration 3s — transient feedback, auto-dismiss
 *   - closeButton always rendered (sonner default fades it in
 *     on hover; we force it visible)
 *   - per-type tinted background using our semantic palette
 *   - default + loading toasts wear the gold (brand) tint —
 *     loading is almost always a scan in flight, so the gold
 *     reads as "we're working on it for you"
 */

const TOAST_BASE =
  "!rounded-xl !p-4 !pr-10 !border !shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_2px_6px_-1px_rgba(15,23,42,0.08)] " +
  "!font-sans !text-sm !leading-snug !min-w-[360px] !max-w-[440px] !relative";

const SUCCESS = "!bg-success-soft !border-[color-mix(in_srgb,var(--success)_30%,transparent)] !text-[color:var(--success)]";
const ERROR = "!bg-danger-soft !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[color:var(--danger)]";
const WARNING = "!bg-warning-soft !border-[color-mix(in_srgb,var(--warning)_35%,transparent)] !text-[color:var(--warning)]";
const INFO = "!bg-info-soft !border-[color-mix(in_srgb,var(--info)_30%,transparent)] !text-[color:var(--info)]";
const GOLD = "!bg-gold-soft !border-[color-mix(in_srgb,var(--gold)_30%,transparent)] !text-gold";

export function AiscanToaster() {
  return (
    <Toaster
      position="bottom-right"
      duration={3000}
      closeButton
      // No theme="dark" — we want our light-tinted backgrounds.
      // No richColors either — that would inject sonner's own
      // semantic colour variables which fight our class overrides.
      icons={{
        success: <CheckCircle2 className="size-5" />,
        error: <XCircle className="size-5" />,
        warning: <AlertTriangle className="size-5" />,
        info: <Info className="size-5" />,
        loading: <Loader2 className="size-5 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: TOAST_BASE,
          title: "!font-semibold !text-[14px] !leading-tight",
          description: "!text-[12.5px] !mt-0.5 !opacity-90",
          // Variant overrides — each class string ends up on the
          // toast root alongside the base, so the cascade is
          // base → variant. Variant wins because the bg/border/
          // text classes are unique to it.
          success: SUCCESS,
          error: ERROR,
          warning: WARNING,
          info: INFO,
          default: GOLD,
          loading: GOLD,
          // Close button visibility + position. sonner default
          // fades it in on hover; we always show it.
          closeButton:
            "!opacity-100 !absolute !top-2 !right-2 !size-6 !rounded-md " +
            "!bg-transparent !border-0 !text-current hover:!bg-black/5",
          icon: "!flex !shrink-0 !mr-1",
        },
      }}
    />
  );
}
