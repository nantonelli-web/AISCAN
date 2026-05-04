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
 *   v2 — drives every variant via Tailwind classes passed
 *   through `toastOptions.classNames`. Each class string is
 *   `!`-prefixed so it overrides sonner's inline style.
 *
 *   v3 (this file, 2026-05-04) — repositioned + sized for
 *   visibility. The bottom-right placement was correct for
 *   chrome-style "fly-by" notifications but on AISCAN's wide
 *   dashboard the user genuinely missed scan-completion toasts
 *   because their attention was on the centre of the canvas.
 *   Moved to top-center, increased min-width to 480px, bumped
 *   title to 16px / description to 14px, duration to 4s, and
 *   gave the wrapper a stronger drop shadow so it doesn't get
 *   absorbed by the page background.
 */

const TOAST_BASE =
  // Wider + taller padding so the toast actually has presence
  // when it lands in the centre. Drop-shadow is now a layered
  // pair: a tight dark close-shadow plus a wider soft glow,
  // so the card reads as floating above the canvas instead of
  // blending with the bg-card colour.
  "!rounded-xl !px-5 !py-4 !pr-12 !border-2 " +
  "!shadow-[0_24px_48px_-12px_rgba(15,23,42,0.25),0_8px_16px_-4px_rgba(15,23,42,0.10)] " +
  "!font-sans !leading-snug !min-w-[480px] !max-w-[600px] !relative !pointer-events-auto";

const SUCCESS = "!bg-success-soft !border-[color-mix(in_srgb,var(--success)_45%,transparent)] !text-[color:var(--success)]";
const ERROR = "!bg-danger-soft !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] !text-[color:var(--danger)]";
const WARNING = "!bg-warning-soft !border-[color-mix(in_srgb,var(--warning)_50%,transparent)] !text-[color:var(--warning)]";
const INFO = "!bg-info-soft !border-[color-mix(in_srgb,var(--info)_45%,transparent)] !text-[color:var(--info)]";
const GOLD = "!bg-gold-soft !border-[color-mix(in_srgb,var(--gold)_45%,transparent)] !text-gold";

export function AiscanToaster() {
  return (
    <Toaster
      position="top-center"
      duration={4000}
      closeButton
      // No theme="dark" — we want our light-tinted backgrounds.
      // No richColors either — that would inject sonner's own
      // semantic colour variables which fight our class overrides.
      icons={{
        success: <CheckCircle2 className="size-6" />,
        error: <XCircle className="size-6" />,
        warning: <AlertTriangle className="size-6" />,
        info: <Info className="size-6" />,
        loading: <Loader2 className="size-6 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: TOAST_BASE,
          title: "!font-semibold !text-[16px] !leading-tight",
          description: "!text-sm !mt-1 !opacity-90",
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
          // Close button — bumped to size-7 to match the larger
          // toast frame. Always visible.
          closeButton:
            "!opacity-100 !absolute !top-2.5 !right-2.5 !size-7 !rounded-md " +
            "!bg-transparent !border-0 !text-current hover:!bg-black/5",
          icon: "!flex !shrink-0 !mr-2 !mt-0.5",
        },
      }}
    />
  );
}
