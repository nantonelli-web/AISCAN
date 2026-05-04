import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KPI tile — the canonical "one number, one label" component.
 *
 * Why this exists: every page rolled its own `<Stat>` (dashboard,
 * benchmarks, brand detail, monitoring) and they all rendered numbers
 * at slightly different sizes / weights / colors. Replacing the
 * inline patterns with a single component does two things at once:
 *   1. Stronger typographic hierarchy — the value reads at 32px
 *      instead of the 24px the inline `text-2xl` was producing.
 *   2. Optional trend arrow + delta with semantic colour, which
 *      multiple sections were asking for ad-hoc.
 *
 * Tone tints the icon container only (never the entire card) so a
 * row of KPIs can carry visual cues without becoming a colour bomb.
 */
export interface KpiProps {
  /** Tiny label above the number — caps + tracking baked into CSS. */
  label: string;
  /** Pre-formatted value string. We do NOT format here so callers
   *  control rounding (formatNumber, percentage, "—" for missing). */
  value: string;
  /** Optional sub-line UNDER the value (date range, sample size, "of N"). */
  hint?: string;
  /** Optional icon — rendered inside a small tinted square. */
  icon?: React.ReactNode;
  /** Tints the icon background. Defaults to neutral. */
  tone?: "neutral" | "info" | "success" | "warning" | "danger" | "gold";
  /** Optional trend (positive = up arrow + success, negative = down +
   *  danger). Pass a pre-formatted string ("+12%") or just a number
   *  and we render the sign for you. */
  trend?: { value: number; label?: string } | null;
  /** Bigger value text — use on hero KPIs (one or two per page). */
  size?: "default" | "lg";
  className?: string;
}

const toneIconBg: Record<NonNullable<KpiProps["tone"]>, string> = {
  neutral: "bg-neutral-soft text-[color:var(--neutral)]",
  info: "bg-info-soft tone-info",
  success: "bg-success-soft tone-success",
  warning: "bg-warning-soft tone-warning",
  danger: "bg-danger-soft tone-danger",
  gold: "bg-gold-soft text-gold",
};

export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trend,
  size = "default",
  className,
}: KpiProps) {
  const trendDir =
    !trend ? "flat"
    : trend.value > 0 ? "up"
    : trend.value < 0 ? "down"
    : "flat";
  const TrendIcon = trendDir === "up" ? ArrowUp : trendDir === "down" ? ArrowDown : Minus;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 sm:p-5 flex items-center gap-4",
        className,
      )}
    >
      {icon && (
        <div className={cn("size-10 rounded-lg grid place-items-center shrink-0", toneIconBg[tone])}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="kpi-label">{label}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className={cn("kpi-value", size === "lg" && "kpi-value--lg")}>
            {value}
          </div>
          {trend && (
            <span
              className={cn(
                "kpi-trend",
                trendDir === "up" && "is-up",
                trendDir === "down" && "is-down",
                trendDir === "flat" && "is-flat",
              )}
              aria-label={`${trendDir} ${Math.abs(trend.value)}%`}
            >
              <TrendIcon className="size-3" strokeWidth={2.5} />
              {trend.label ?? `${Math.abs(trend.value)}%`}
            </span>
          )}
        </div>
        {hint && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Section header — replaces the ubiquitous `<div className="space-y-1">
 * <h2 ...>Title</h2><p ...>desc</p></div>` pattern. Keeps the title /
 * description weight ratio consistent and offers an optional eyebrow
 * tag (BENCHMARKS, MONITORING, …) and right-aligned action slot.
 *
 * Optional `icon` slot pairs a meaningful glyph with the title (Radar
 * for Scan, Clock for History, BarChart for Benchmarks, …) so the
 * eye lands on the section break before reading the words. Text-only
 * section titles were a recurring complaint in user testing.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  icon,
  iconTone = "gold",
  className,
  size = "default",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: "gold" | "info" | "success" | "warning" | "danger" | "neutral";
  className?: string;
  /** "page" = top-of-page <h1>; "default" = section <h2>. */
  size?: "page" | "default";
}) {
  const iconBg: Record<NonNullable<typeof iconTone>, string> = {
    gold: "bg-gold-soft text-gold",
    info: "bg-info-soft tone-info",
    success: "bg-success-soft tone-success",
    warning: "bg-warning-soft tone-warning",
    danger: "bg-danger-soft tone-danger",
    neutral: "bg-neutral-soft text-[color:var(--neutral)]",
  };
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && size !== "page" && (
          <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", iconBg[iconTone])}>
            {icon}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          {size === "page" ? (
            <div className="flex items-center gap-3">
              {icon && (
                <div className={cn("size-10 rounded-lg grid place-items-center shrink-0", iconBg[iconTone])}>
                  {icon}
                </div>
              )}
              <h1 className="text-3xl font-serif tracking-tight">{title}</h1>
            </div>
          ) : (
            <h2 className="text-lg font-semibold tracking-tight leading-tight">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground max-w-2xl text-pretty">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 print:hidden">{action}</div>}
    </header>
  );
}

/**
 * Status dot — small round indicator with semantic tone. Replaces the
 * ad-hoc `<span className="text-green-400 bg-green-400/10 ...">ACTIVE</span>`
 * pills scattered across cards. Uses .status-pill from globals.css.
 */
export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: "active" | "inactive" | "paused" | "running" | "error";
  label: string;
  className?: string;
}) {
  const cls =
    tone === "active" ? "is-active"
    : tone === "paused" ? "is-paused"
    : tone === "running" ? "is-running"
    : tone === "error" ? "is-error"
    : "is-inactive";
  return <span className={cn("status-pill", cls, className)}>{label}</span>;
}
