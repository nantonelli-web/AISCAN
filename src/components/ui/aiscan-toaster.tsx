"use client";

import { Toaster } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

/**
 * AISCAN-themed toast container — wraps sonner's <Toaster> so the
 * notifications feel part of the product instead of a stock dark
 * pill.
 *
 * Implementation history:
 *
 *   v1 — globals.css selectors lost to sonner inline styles.
 *   v2 — Tailwind '!'-prefixed classNames; correct but bottom-right
 *        + thin shadow → user kept missing the toasts.
 *   v3 — top-center, 480-600px wide, 2px border, large icons,
 *        title 16px bold. Visible but the user flagged the
 *        loading variant as "esteticamente orribile" — too
 *        loud, screamy "alert" feel for what is normally a
 *        progress indicator.
 *
 *   v4 (this file, 2026-05-04) — refined, calm, still visible.
 *
 *      • position: bottom-center (user preference) with a 24px
 *        offset from the edge so the toast doesn't kiss the
 *        viewport bottom.
 *      • frame: pill-rounded (rounded-full for short/loading,
 *        rounded-2xl for taller success/error). 1px border in
 *        the variant tint at 25% opacity; the heavy 2px border
 *        from v3 is gone.
 *      • shadow: layered soft glow + tight contact shadow for a
 *        "floating above the canvas" feel without competing
 *        with the toast colour.
 *      • title 14px medium-weight (was 16px bold). Description
 *        13px / 90% opacity. Compact min-width 360px,
 *        max-width 520px.
 *      • icons size-5 (was 6) so they sit comfortably with the
 *        14px text instead of dominating it.
 *      • loading uses a neutral charcoal background instead of
 *        the gold-soft yellow that v3 mis-coded as a "currently
 *        working" signal — Linear/Notion style. Spinner
 *        itself is muted gold so the brand is still present.
 */

const TOAST_BASE =
  "!rounded-2xl !px-4 !py-3 !pr-10 !border " +
  "!shadow-[0_18px_36px_-12px_rgba(15,23,42,0.18),0_4px_10px_-2px_rgba(15,23,42,0.06)] " +
  "!font-sans !leading-snug !min-w-[360px] !max-w-[520px] !relative !pointer-events-auto";

const SUCCESS = "!bg-success-soft !border-[color-mix(in_srgb,var(--success)_25%,transparent)] !text-[color:var(--success)]";
const ERROR = "!bg-danger-soft !border-[color-mix(in_srgb,var(--danger)_25%,transparent)] !text-[color:var(--danger)]";
const WARNING = "!bg-warning-soft !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[color:var(--warning)]";
const INFO = "!bg-info-soft !border-[color-mix(in_srgb,var(--info)_25%,transparent)] !text-[color:var(--info)]";
// Default + loading lean on the calm card surface — bg-card with
// a hairline border. This is the variant the user explicitly
// asked to be more elegant: no aggressive tint, no thick border,
// no shouting.
const DEFAULT = "!bg-card !border-border !text-foreground";

export function AiscanToaster() {
  return (
    <Toaster
      position="bottom-center"
      duration={4000}
      offset={24}
      closeButton
      // No theme="dark" — we want our light-tinted backgrounds.
      // No richColors either — that would inject sonner's own
      // semantic colour variables which fight our class overrides.
      icons={{
        success: <CheckCircle2 className="size-5" />,
        error: <XCircle className="size-5" />,
        warning: <AlertTriangle className="size-5" />,
        info: <Info className="size-5" />,
        // Spinner kept gold so there's still a brand pulse on
        // the most-frequent toast variant. Smaller size matches
        // the new compact frame.
        loading: <Loader2 className="size-4 animate-spin text-gold" />,
      }}
      toastOptions={{
        classNames: {
          toast: TOAST_BASE,
          title: "!font-medium !text-[14px] !leading-tight",
          description: "!text-[13px] !mt-0.5 !opacity-80",
          success: SUCCESS,
          error: ERROR,
          warning: WARNING,
          info: INFO,
          default: DEFAULT,
          loading: DEFAULT,
          closeButton:
            "!opacity-60 hover:!opacity-100 !absolute !top-2.5 !right-2.5 !size-6 !rounded-md " +
            "!bg-transparent !border-0 !text-current hover:!bg-black/5",
          icon: "!flex !shrink-0 !mr-2 !mt-px",
        },
      }}
    />
  );
}
