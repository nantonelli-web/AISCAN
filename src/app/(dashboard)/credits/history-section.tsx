"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

interface HistoryEntry {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

/**
 * Transaction History — collapsible card, closed by default per the
 * 2026-04-28 UX rework. Click the header to expand/collapse. Server
 * fetches the rows and passes them in already-sorted; we just render.
 *
 * Locale used for date formatting is passed in (no useT for dates so
 * the format matches what the rest of the dashboard uses everywhere).
 */
export function HistorySection({
  history,
  locale,
}: {
  history: HistoryEntry[];
  locale: "it" | "en";
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const count = history.length;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(
      locale === "it" ? "it-IT" : "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-muted/30 transition-colors cursor-pointer rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{t("credits", "history")}</span>
          <span className="text-[10px] text-muted-foreground">({count})</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {open ? t("credits", "collapseHint") : t("credits", "expandHint")}
        </span>
      </button>
      {open && (
        <CardContent className="pt-0">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("credits", "noHistory")}
            </p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
                <span>{t("credits", "reason")}</span>
                <span className="text-right w-20">{t("credits", "amount")}</span>
                <span className="text-right w-36">{t("credits", "date")}</span>
              </div>
              {history.map((h) => (
                <div
                  key={h.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 text-sm"
                >
                  <span className="text-muted-foreground truncate">
                    {h.reason}
                  </span>
                  <span
                    className={
                      h.amount > 0
                        ? "text-right w-20 font-medium text-green-400"
                        : "text-right w-20 font-medium text-red-400"
                    }
                  >
                    {h.amount > 0 ? "+" : ""}
                    {h.amount}
                  </span>
                  <span className="text-right w-36 text-xs text-muted-foreground">
                    {formatDate(h.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
