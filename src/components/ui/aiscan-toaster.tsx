"use client";

import { Toaster } from "sonner";

/**
 * AISCAN-themed toast container — wraps sonner's <Toaster> with our
 * design tokens so notifications feel part of the product instead of
 * a stock dark-mode pill.
 *
 * Decisions encoded here:
 *   - **Position bottom-right** — same corner the user expects (we
 *     used it before), but the box is now ~420px wide instead of
 *     the default ~360, with substantial padding so the message
 *     can't be missed.
 *   - **Duration 3s** for transient confirmations + 5s for errors
 *     (set per-call via toast.error). Auto-dismiss fits the user's
 *     ask "si chiude dopo 3 secondi".
 *   - **closeButton always visible** — sonner default hides it on
 *     hover; we force it on so the user always has the X to dismiss
 *     manually.
 *   - **richColors** — gives semantic backgrounds per type (success
 *     green-tinted, error red-tinted, warning amber, info blue) AND
 *     auto-renders the canonical icon for each type (CircleCheck,
 *     CircleX, TriangleAlert, Info). The icons end up at ~20px on
 *     the left of the text — visible at a glance.
 *   - **Light theme** so the rich-color tints land on a white-ish
 *     base instead of dark mode (which inverted them and made them
 *     hard to read on a light page).
 *
 * Custom CSS in globals.css targets sonner's data-attributes for
 * the finer details (border-radius, shadow, icon size). Keeping the
 * class hooks here in JS would force every variant to repeat the
 * same Tailwind list; CSS does it once.
 */
export function AiscanToaster() {
  return (
    <Toaster
      theme="light"
      position="bottom-right"
      duration={3000}
      closeButton
      richColors
      // Class hooks consumed by `globals.css` (.aiscan-toast root +
      // [data-type] children). We don't pass Tailwind here because
      // sonner re-renders on every toast and the class string would
      // bloat each render — CSS rules win on file size + runtime.
      toastOptions={{
        classNames: {
          toast: "aiscan-toast",
        },
      }}
    />
  );
}
