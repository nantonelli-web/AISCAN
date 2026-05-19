"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeShortcuts, defaultPresets } from "@/components/ui/date-range-shortcuts";
import { useT } from "@/lib/i18n/context";
import { cn, jumpToDateInput } from "@/lib/utils";

/**
 * Date-range filter per la sezione "Creativita & insight" del
 * brand-detail. UX coerente con /benchmarks ma con confronto
 * integrato (NON piu' un toggle separato "Periodo precedente"):
 * un check "Confronta con un altro periodo" rivela un secondo set
 * di date inputs. Cosi periodo + confronto vivono dentro un solo
 * blocco compatto e l'utente capisce la relazione.
 *
 * Eyebrow interna rimossa 2026-05-19 (era duplicata col titolo
 * "PERIODO DI ANALISI" del parent — vedi filtersNode in
 * channel-tabs.tsx).
 *
 * URL params:
 *   - from / to: periodo corrente
 *   - compareFrom / compareTo / compare=custom: confronto attivo
 *   - rimosso compare=previous (sostituito da custom esplicito)
 */
export function CreativesDateFilter({
  dateFrom,
  dateTo,
  compareFrom,
  compareTo,
  compareEnabled,
  compareDisabled = false,
}: {
  dateFrom: string | null;
  dateTo: string | null;
  compareFrom: string | null;
  compareTo: string | null;
  compareEnabled: boolean;
  /** True quando il confronto non ha senso semantico — es. canale
   *  "all" (KPIs eterogenei tra Meta/Google/IG non confrontabili
   *  come singolo aggregato). Nasconde il checkbox del confronto
   *  con tooltip esplicativo. */
  compareDisabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();
  const [from, setFrom] = useState(dateFrom ?? "");
  const [to, setTo] = useState(dateTo ?? "");
  const [compareOn, setCompareOn] = useState(compareEnabled);
  const [cFrom, setCFrom] = useState(compareFrom ?? "");
  const [cTo, setCTo] = useState(compareTo ?? "");
  // useTransition fa percepire la navigazione meno "refresh anni
  // 2000": l'UI vecchia resta visibile mentre la nuova streamma in
  // background. isPending alimenta lo spinner accanto al bottone
  // Applica cosi l'utente sa che sta succedendo qualcosa.
  const [isPending, startTransition] = useTransition();
  const toRef = useRef<HTMLInputElement | null>(null);
  const cToRef = useRef<HTMLInputElement | null>(null);

  const rangeInvalid = !!from && !!to && from > to;
  const compareInvalid = compareOn && !!cFrom && !!cTo && cFrom > cTo;
  const dirty =
    from !== (dateFrom ?? "") ||
    to !== (dateTo ?? "") ||
    compareOn !== compareEnabled ||
    cFrom !== (compareFrom ?? "") ||
    cTo !== (compareTo ?? "");

  function buildHref(args: {
    f: string;
    tt: string;
    cf: string;
    ct: string;
    cmpOn: boolean;
  }): string {
    const next = new URLSearchParams(searchParams);
    if (args.f) next.set("from", args.f);
    else next.delete("from");
    if (args.tt) next.set("to", args.tt);
    else next.delete("to");
    if (args.cmpOn && args.cf && args.ct) {
      next.set("compare", "custom");
      next.set("compareFrom", args.cf);
      next.set("compareTo", args.ct);
    } else {
      next.delete("compare");
      next.delete("compareFrom");
      next.delete("compareTo");
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function apply() {
    if (rangeInvalid || compareInvalid) return;
    startTransition(() => {
      router.push(
        buildHref({ f: from, tt: to, cf: cFrom, ct: cTo, cmpOn: compareOn }),
        // scroll: false → no auto-scroll al top. L'utente resta dove
        // sta a guardare i risultati invece di essere riportato al
        // channel pivot in alto.
        { scroll: false },
      );
    });
  }

  function reset() {
    setFrom("");
    setTo("");
    setCompareOn(false);
    setCFrom("");
    setCTo("");
    startTransition(() => {
      router.push(
        buildHref({ f: "", tt: "", cf: "", ct: "", cmpOn: false }),
        { scroll: false },
      );
    });
  }

  function toggleCompare() {
    const nextOn = !compareOn;
    setCompareOn(nextOn);
    if (!nextOn) {
      setCFrom("");
      setCTo("");
    }
  }

  return (
    <div className="space-y-5">
      {/* Riga principale: range corrente + shortcuts + actions */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          onChange={(e) => {
            setTo(e.target.value);
            // Blur esplicito per chiudere il native picker dopo la
            // selezione — alcuni browser (Chrome) lo lasciavano
            // aperto quando l'input era stato focusato programmati-
            // camente dal jumpToDateInput precedente.
            if (e.target.value) e.target.blur();
          }}
          className="text-xs h-8 w-36"
        />
        <DateRangeShortcuts
          presets={defaultPresets((s, k) => t(s, k))}
          activeFrom={from}
          activeTo={to}
          onPick={(r) => {
            setFrom(r.from);
            setTo(r.to);
            startTransition(() => {
              router.push(
                buildHref({
                  f: r.from,
                  tt: r.to,
                  cf: cFrom,
                  ct: cTo,
                  cmpOn: compareOn,
                }),
                { scroll: false },
              );
            });
          }}
        />
        {rangeInvalid && (
          <span className="text-[11px] text-red-500">
            {t("benchmarks", "rangeInvalid")}
          </span>
        )}
      </div>

      {/* Toggle "Confronta con un altro periodo" — checkbox piu'
          grande e con label visibile. Spacing generoso (space-y-5
          sopra) per non sembrare incollata al range principale.
          Disabled quando compareDisabled (es. canale "Tutti" - i KPI
          sono eterogenei tra canali, non confrontabili come singolo
          numero) o quando manca il range principale. */}
      <label
        className={cn(
          "inline-flex items-center gap-2.5 select-none transition-colors",
          compareDisabled || !from || !to
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:opacity-90",
        )}
        title={
          compareDisabled
            ? t("competitors", "compareNotAvailableForAll")
            : !from || !to
              ? t("competitors", "compareRequiresDateRange")
              : undefined
        }
      >
        <input
          type="checkbox"
          checked={compareOn && !compareDisabled}
          onChange={toggleCompare}
          disabled={compareDisabled || !from || !to}
          className="sr-only peer"
        />
        <span
          className={cn(
            "inline-flex items-center justify-center size-5 rounded-md border-2 transition-colors",
            compareOn && !compareDisabled
              ? "bg-gold border-gold text-gold-foreground"
              : "bg-background border-foreground/40",
          )}
        >
          {compareOn && !compareDisabled && (
            <Check className="size-3.5" strokeWidth={3} />
          )}
        </span>
        <span className="text-sm font-medium text-foreground">
          {t("competitors", "compareEnableLabel")}
        </span>
        {compareDisabled && (
          <span className="text-[11px] text-muted-foreground italic">
            {t("competitors", "compareNotAvailableForAllShort")}
          </span>
        )}
      </label>

      {/* "Periodo di confronto" come sezione titolata separata —
          stesso formato di "Periodo di analisi" (h3 small-caps bold
          + range sotto). Visibile solo quando il check sopra e'
          attivo. */}
      {compareOn && (
        <section className="space-y-3 pt-1">
          <h3 className="text-[11px] uppercase tracking-wider text-foreground font-bold">
            {t("competitors", "compareRangeHeader")}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Input
              type="date"
              value={cFrom}
              onChange={(e) => {
                setCFrom(e.target.value);
                if (e.target.value) jumpToDateInput(cToRef.current);
              }}
              className="text-xs h-8 w-36"
            />
            <span className="text-muted-foreground text-xs">—</span>
            <Input
              ref={cToRef}
              type="date"
              value={cTo}
              onChange={(e) => {
                setCTo(e.target.value);
                if (e.target.value) e.target.blur();
              }}
              className="text-xs h-8 w-36"
            />
            {compareInvalid && (
              <span className="text-[11px] text-red-500">
                {t("benchmarks", "rangeInvalid")}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Bottoni Reset / Applica in basso a destra del box date
          — riga dedicata cosi non competono col primo input.
          Richiesta utente 2026-05-19. */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          onClick={reset}
          variant="outline"
          size="sm"
          className="h-8 text-xs cursor-pointer"
          disabled={(!from && !to && !compareOn) || isPending}
        >
          <RotateCcw className="size-3.5" />
          {t("benchmarks", "resetFilters")}
        </Button>
        <Button
          onClick={apply}
          disabled={!dirty || rangeInvalid || compareInvalid || isPending}
          size="sm"
          className="h-8 text-xs cursor-pointer"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {t("benchmarks", "apply")}
        </Button>
      </div>
    </div>
  );
}
