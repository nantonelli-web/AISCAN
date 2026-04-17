"use client";

import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { JobHistory } from "./job-history";
import { useT } from "@/lib/i18n/context";
import type { MaitScrapeJob } from "@/types";

export function CollapsibleJobHistory({ jobs }: { jobs: MaitScrapeJob[] }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useT();

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

  return (
    <div>
      {/* Compact summary bar */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-gold/40 hover:border-gold/60 transition-colors text-xs text-muted-foreground"
      >
        <History className="size-3.5 shrink-0" />
        <span className="font-medium text-foreground">{t("jobHistory", "title")}</span>
        <span className="text-border">—</span>
        <span>
          {jobs.length} scan · {succeeded} {t("jobHistory", "succeededLabel")} · {totalAds} ads
          {latest?.started_at && (
            <> · {t("jobHistory", "lastRun")} {formatRelative(latest.started_at)}</>
          )}
        </span>
        <ChevronDown
          className={`size-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded full history */}
      {open && (
        <div className="mt-2">
          <JobHistory jobs={jobs} />
        </div>
      )}
    </div>
  );
}
