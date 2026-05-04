"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeShortcuts, defaultPresets } from "@/components/ui/date-range-shortcuts";
import { useT } from "@/lib/i18n/context";
import { jumpToDateInput } from "@/lib/utils";

interface Props {
  dateFrom: string;
  dateTo: string;
  channel: string;
  client: string | null;
  activeBrandIds: string[];
  totalBrands: number;
  countries: string[];
  totalCountries: number;
  /** Preserved through buildHref so Apply/Reset on the date range do
   *  not silently drop the user's Active/Inactive narrowing. */
  status: "active" | "inactive" | null;
}

/**
 * Final filter row before the data card. Local state is staged; Apply flushes
 * from/to to the URL (keeping the current brand + project + channel params).
 * Reset jumps back to the default last-30-day window AND publishes it.
 */
export function DateRangeFilter({
  dateFrom,
  dateTo,
  channel,
  client,
  activeBrandIds,
  totalBrands,
  countries,
  totalCountries,
  status,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const toRef = useRef<HTMLInputElement | null>(null);

  const rangeInvalid = !from || !to || from > to;
  const dirty = from !== dateFrom || to !== dateTo;

  function buildHref(f: string, tt: string): string {
    const params = new URLSearchParams();
    params.set("channel", channel);
    if (client) params.set("client", client);
    if (countries.length !== totalCountries && countries.length > 0) {
      params.set("countries", countries.join(","));
    }
    if (activeBrandIds.length !== totalBrands && activeBrandIds.length > 0) {
      params.set("brands", activeBrandIds.join(","));
    }
    params.set("from", f);
    params.set("to", tt);
    if (status) params.set("status", status);
    return `/benchmarks?${params.toString()}`;
  }

  function apply() {
    if (rangeInvalid) return;
    router.push(buildHref(from, to));
  }

  function reset() {
    const today = new Date();
    const ago = new Date(today);
    ago.setDate(today.getDate() - 30);
    const f = ago.toISOString().slice(0, 10);
    const tt = today.toISOString().slice(0, 10);
    setFrom(f);
    setTo(tt);
    router.push(buildHref(f, tt));
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
      {/* Shortcut chips — auto-apply on click since the user's intent
          is unambiguous ("show me last 30 days"). Skipping the
          manual Apply step removes a friction point. */}
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
        <span className="text-[11px] text-red-500">{t("benchmarks", "rangeInvalid")}</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          onClick={reset}
          variant="outline"
          size="sm"
          className="h-8 text-xs cursor-pointer"
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
