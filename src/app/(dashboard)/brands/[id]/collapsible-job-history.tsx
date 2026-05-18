"use client";

import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { JobHistory } from "./job-history";
import { useT } from "@/lib/i18n/context";
import type { MaitScrapeJob } from "@/types";

/**
 * Cronologia scan collassabile. Quando usata come sezione top-level
 * (variant default) ha un suo border + hover gold. Quando usata
 * INLINE dentro un'altra card (es. dentro Scan body), passare
 * inline=true rimuove il border ridondante: l'unica cornice e' il
 * sub-frame info-tinted o il parent stesso.
 */
export function CollapsibleJobHistory({
  jobs,
  inline = false,
}: {
  jobs: MaitScrapeJob[];
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  const latest = jobs[0];
  const succeeded = jobs.filter((j) => j.status === "succeeded").length;
  const totalAds = jobs.reduce((s, j) => s + j.records_count, 0);

  function formatRelative(d: string | null) {
    if (!d) return "—";
    const diffMs = Date.now() - new Date(d).getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.round(diffH * 60)}${t("relativeTime", "minutesAgo")}`;
    if (diffH < 24) return `${Math.round(diffH)}${t("relativeTime", "hoursAgo")}`;
    return `${Math.round(diffH / 24)}${t("relativeTime", "daysAgo")}`;
  }

  const buttonClass = inline
    ? "flex items-center gap-3 w-full text-left px-1 py-1.5 hover:bg-muted/30 rounded-md transition-colors group cursor-pointer"
    : "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-gold/40 hover:bg-muted/30 transition-colors group cursor-pointer";

  return (
    <div>
      <button onClick={() => setOpen(!open)} className={buttonClass}>
        <div
          className={
            inline
              ? "size-7 rounded-md bg-info-soft tone-info grid place-items-center shrink-0"
              : "size-9 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0"
          }
        >
          <History className={inline ? "size-4" : "size-5"} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={
              inline
                ? "text-sm font-semibold tracking-tight leading-tight"
                : "text-base font-semibold tracking-tight leading-tight"
            }
          >
            {t("jobHistory", "title")}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            {jobs.length} scan · {succeeded} {t("jobHistory", "succeededLabel")} · {totalAds} ads
            {latest?.started_at && (
              <> · {t("jobHistory", "lastRun")} {formatRelative(latest.started_at)}</>
            )}
          </p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground group-hover:text-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2">
          <JobHistory jobs={jobs} />
        </div>
      )}
    </div>
  );
}
