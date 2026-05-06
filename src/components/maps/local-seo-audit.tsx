/**
 * Sezione audit Local SEO per una card place: punteggio + checklist
 * dei controlli. Si renderizza compatta inline; nessuna interazione
 * (nessun expand/collapse) — la lista intera e' breve e leggibile.
 */

import { Check, X } from "lucide-react";
import type { AuditResult } from "@/lib/maps/audit";
import { auditTier } from "@/lib/maps/audit";

interface Props {
  audit: AuditResult;
  title: string;
  /** i18n labels per item, key = AuditItem.labelKey. */
  labels: Record<string, string>;
}

export function LocalSeoAudit({ audit, title, labels }: Props) {
  const tier = auditTier(audit.score, audit.max);
  const tierClasses: Record<typeof tier, string> = {
    low: "text-red-400",
    mid: "text-amber-400",
    high: "text-emerald-400",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
          {title}
        </p>
        <p className={`text-xs tabular-nums font-semibold ${tierClasses[tier]}`}>
          {audit.score}/{audit.max}
        </p>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
        {audit.items.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-1.5 ${
              item.ok ? "text-foreground" : "text-muted-foreground/70"
            }`}
          >
            {item.ok ? (
              <Check className="size-3 text-emerald-400 shrink-0" />
            ) : (
              <X className="size-3 text-red-400/70 shrink-0" />
            )}
            <span>{labels[item.labelKey] ?? item.labelKey}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
