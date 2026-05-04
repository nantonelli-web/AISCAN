"use client";

import { cn } from "@/lib/utils";

/**
 * Date-range shortcut chips. Sit next to a from/to date pair and
 * one-click set both inputs to a common window. Replaces the
 * "let-the-user-pick-two-dates-by-hand" UX in Scan / Compare /
 * Benchmarks — most users want "last 30 days" 90% of the time.
 *
 * Output is always {from, to} as ISO yyyy-mm-dd strings so the
 * caller can drop them straight into <Input type="date" value={…}/>
 * (which is what every consumer does).
 *
 * `presets` defaults to a sensible 4-shortcut set; callers can
 * pass their own list when a specific surface needs different
 * windows (e.g. SERP-history "this week / last week").
 *
 * `activeFrom` / `activeTo` let the chip highlight when the
 * current input values match exactly — gives the user a "this is
 * the preset I'm on" signal so they don't re-click it.
 */

export type DateRangePreset = {
  key: string;
  /** Localised label rendered on the chip. */
  label: string;
  /** Returns the {from, to} ISO pair this preset represents. The
   *  function form lets us compute "today" / "this month" relative
   *  to the moment the user clicks, not page-load time. */
  range: () => { from: string; to: string };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function todayISO(): string {
  return isoDate(new Date());
}

/**
 * Default preset list — covers the 95% case across our date-range
 * surfaces. Order matters: shortest window first so the chips read
 * left-to-right as "tighten / widen".
 */
export function defaultPresets(t: (s: string, k: string) => string): DateRangePreset[] {
  return [
    {
      key: "7d",
      label: t("dateShortcuts", "last7Days"),
      range: () => ({ from: daysAgo(7), to: todayISO() }),
    },
    {
      key: "14d",
      label: t("dateShortcuts", "last14Days"),
      range: () => ({ from: daysAgo(14), to: todayISO() }),
    },
    {
      key: "30d",
      label: t("dateShortcuts", "last30Days"),
      range: () => ({ from: daysAgo(30), to: todayISO() }),
    },
    {
      key: "90d",
      label: t("dateShortcuts", "last90Days"),
      range: () => ({ from: daysAgo(90), to: todayISO() }),
    },
  ];
}

export function DateRangeShortcuts({
  presets,
  activeFrom,
  activeTo,
  onPick,
  className,
}: {
  presets: DateRangePreset[];
  /** Current `from` value of the consumer's date input. Used to
   *  highlight which preset (if any) matches the current range. */
  activeFrom?: string;
  /** Current `to` value of the consumer's date input. */
  activeTo?: string;
  onPick: (range: { from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {presets.map((p) => {
        const r = p.range();
        const active = activeFrom === r.from && activeTo === r.to;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(r)}
            className={cn(
              "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer",
              active
                ? "bg-gold text-gold-foreground border-gold"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
