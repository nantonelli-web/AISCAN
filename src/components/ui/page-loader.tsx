/**
 * Centered "scanning radar" loader — replaces the small Loader2
 * spinner the user flagged as underwhelming. Theme matches the
 * product: AISCAN scans competitors, so the loader reads as
 * a concentric pulse expanding from a gold core, with the AISCAN
 * monogram pinned at the centre. Fully CSS — no JS animation, no
 * dependencies, works in server components.
 *
 * Variant `block` (default) sits inside a section with vertical
 * padding and is the right pick for `loading.tsx` files; variant
 * `overlay` covers its parent with a backdrop and is meant for
 * inline async operations (regenerate, scan, AI tab).
 */

import { cn } from "@/lib/utils";

interface PageLoaderProps {
  /** Layout. `block` = inline section with py-24, used by the
   *  Suspense `loading.tsx` files. `overlay` = absolute-positioned
   *  backdrop, used inside Cards / panels for in-flight ops. */
  variant?: "block" | "overlay";
  /** Optional caption rendered under the radar. Kept short — long
   *  copy below a centered loader feels apologetic. */
  label?: string;
  /** Extra classes for the outer wrapper (control min-height,
   *  positioning, etc.). */
  className?: string;
}

export function PageLoader({
  variant = "block",
  label,
  className,
}: PageLoaderProps) {
  const wrapperClass =
    variant === "overlay"
      ? "absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-sm"
      : "flex items-center justify-center py-24";

  return (
    <div className={cn(wrapperClass, className)} aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-6">
        <div className="relative size-28">
          {/* Outer expanding rings — three offset waves give the
              "radar pulse" feel without needing keyframes per
              ring. The animation is defined in globals.css as
              `aiscan-pulse`. */}
          <span className="absolute inset-0 rounded-full border border-gold/40 animate-aiscan-pulse" />
          <span className="absolute inset-0 rounded-full border border-gold/40 animate-aiscan-pulse [animation-delay:600ms]" />
          <span className="absolute inset-0 rounded-full border border-gold/40 animate-aiscan-pulse [animation-delay:1200ms]" />

          {/* Static inner ring — gives the centre something to anchor
              to so the pulses do not feel like they emanate from
              nothing. */}
          <span className="absolute inset-[28%] rounded-full border border-gold/30" />

          {/* Core — gold dot with a soft glow + breathing pulse */}
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_20px_4px_rgba(14,53,144,0.45)] animate-aiscan-core" />
        </div>

        {label && (
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
