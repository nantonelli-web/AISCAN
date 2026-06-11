"use client";

import { CollapsibleAlert } from "@/app/(dashboard)/benchmarks/collapsible-alert";
import { useT } from "@/lib/i18n/context";
import {
  computeFreshnessGaps,
  type ScanCoverageEntry,
} from "@/lib/analytics/scan-coverage";

/**
 * Scan-coverage freshness warning, shared by Compare and Benchmarks.
 *
 * Given the latest scan per brand for a channel (from getScanCoverage)
 * and the end of the selected window, it flags brands whose data doesn't
 * reach that end (stale scan) or that were never scanned on the channel,
 * so the user knows the comparison isn't apples-to-apples. Renders
 * nothing when every brand is aligned. Reuses the Benchmarks
 * CollapsibleAlert so the look matches the existing coverage warning.
 */
export function CoverageAlert({
  coverage,
  windowTo,
  toleranceDays = 3,
  persistKey = "scan-coverage-freshness",
}: {
  coverage: ScanCoverageEntry[];
  /** End of the selected comparison window (ISO date, YYYY-MM-DD). */
  windowTo: string;
  toleranceDays?: number;
  persistKey?: string;
}) {
  const { t } = useT();
  if (!coverage || coverage.length === 0) return null;

  const { gaps, neverScanned } = computeFreshnessGaps(
    coverage,
    windowTo,
    toleranceDays,
  );
  if (gaps.length === 0 && neverScanned.length === 0) return null;

  const count = gaps.length + neverScanned.length;
  return (
    <CollapsibleAlert
      tone="warning"
      title={t("coverageAlert", "title")}
      summary={`${count} ${count === 1 ? t("coverageAlert", "brandSingular") : t("coverageAlert", "brandPlural")}`}
      persistKey={persistKey}
    >
      <p className="text-[11px] text-muted-foreground mb-2">
        {t("coverageAlert", "body")}
      </p>
      <ul className="text-[11px] text-foreground space-y-0.5">
        {gaps.map((g) => (
          <li key={g.competitorId}>
            <span className="font-medium">{g.name}</span>
            {" — "}
            {t("coverageAlert", "coveredUntil")} {g.coveredUntil}{" "}
            ({g.gapDays} {t("coverageAlert", "daysBehind")})
          </li>
        ))}
        {neverScanned.map((n) => (
          <li key={n.competitorId}>
            <span className="font-medium">{n.name}</span>
            {" — "}
            {t("coverageAlert", "neverScanned")}
          </li>
        ))}
      </ul>
    </CollapsibleAlert>
  );
}
