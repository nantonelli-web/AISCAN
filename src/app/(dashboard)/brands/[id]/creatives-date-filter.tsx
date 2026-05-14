"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeShortcuts, defaultPresets } from "@/components/ui/date-range-shortcuts";
import { useT } from "@/lib/i18n/context";
import { jumpToDateInput } from "@/lib/utils";

/**
 * Date-range filter per la sezione "Creativita & insight" del
 * brand-detail. Stessa UX di /benchmarks (CalendarRange icon + due
 * date input + shortcuts + Reset / Apply) ma autonomo sul URL della
 * brand page — preserva ogni altro searchParam (tab, status,
 * countries) e aggiorna solo `from` / `to`.
 *
 * "Reset" rimuove i parametri (= no narrowing, mostra tutta la
 * coverage). Non lo riporta a "ultimi 30 giorni" come in benchmarks
 * perche' il default sulla brand-page e' "tutto", e l'utente che
 * clicca Reset di solito vuole ripulire, non sostituire una finestra
 * con un'altra finestra.
 */
export function CreativesDateFilter({
  dateFrom,
  dateTo,
}: {
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();
  const [from, setFrom] = useState(dateFrom ?? "");
  const [to, setTo] = useState(dateTo ?? "");
  const toRef = useRef<HTMLInputElement | null>(null);

  const rangeInvalid = !!from && !!to && from > to;
  const dirty = from !== (dateFrom ?? "") || to !== (dateTo ?? "");

  function buildHref(f: string, tt: string): string {
    const next = new URLSearchParams(searchParams);
    if (f) next.set("from", f);
    else next.delete("from");
    if (tt) next.set("to", tt);
    else next.delete("to");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function apply() {
    if (rangeInvalid) return;
    router.push(buildHref(from, to));
  }

  function reset() {
    setFrom("");
    setTo("");
    router.push(buildHref("", ""));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3 print:hidden">
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-foreground font-bold">
          {t("benchmarks", "analysisRange")}
        </span>
      </div>
      <Input
        type="date"
        value={from}
        onChange={(e) => {
          setFrom(e.target.value);
          if (e.target.value) jumpToDateInput(toRef.current);
        }}
        className="text-xs h-8 w-36"
      />
      <span className="text-muted-foreground text-xs">—</span>
      <Input
        ref={toRef}
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="text-xs h-8 w-36"
      />
      <DateRangeShortcuts
        presets={defaultPresets((s, k) => t(s, k))}
        activeFrom={from}
        activeTo={to}
        onPick={(r) => {
          setFrom(r.from);
          setTo(r.to);
          router.push(buildHref(r.from, r.to));
        }}
      />
      {rangeInvalid && (
        <span className="text-[11px] text-red-500">
          {t("benchmarks", "rangeInvalid")}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          onClick={reset}
          variant="outline"
          size="sm"
          className="h-8 text-xs cursor-pointer"
          disabled={!from && !to}
        >
          <RotateCcw className="size-3.5" />
          {t("benchmarks", "resetFilters")}
        </Button>
        <Button
          onClick={apply}
          disabled={!dirty || rangeInvalid}
          size="sm"
          className="h-8 text-xs cursor-pointer"
        >
          <Check className="size-3.5" />
          {t("benchmarks", "apply")}
        </Button>
      </div>
    </div>
  );
}
