"use client";

import * as React from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Date range picker — sostituisce la coppia di `<input type="date">`
 * nativi (che hanno styling diverso su ogni browser e UX rotto su
 * macOS Safari). Trigger button mostra il range formattato in
 * italiano; il click apre un Calendar in Popover che permette
 * selezione di un intervallo (2 click: from poi to).
 *
 * Accetta date come stringhe ISO `YYYY-MM-DD` per coerenza con
 * le query string e le rotte API esistenti. Internamente lavora
 * con `Date` ma la firma esterna resta string-based.
 */
function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  // Costruzione locale (no UTC shift): se iso = "2026-05-19" voglio
  // 19 maggio nella timezone locale, non 18 maggio sera UTC.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  disabled = false,
  placeholder = "Seleziona periodo",
  className,
  align = "start",
}: {
  /** ISO date string YYYY-MM-DD. Stringa vuota = nessuna data. */
  from: string;
  to: string;
  /** Chiamato con le nuove date in formato ISO. Passa stringa vuota
   *  se l'utente ha azzerato un estremo. */
  onChange: (range: { from: string; to: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = React.useState(false);

  const range = React.useMemo<DateRange | undefined>(() => {
    const f = isoToDate(from);
    const t = isoToDate(to);
    if (!f && !t) return undefined;
    return { from: f, to: t };
  }, [from, to]);

  // Display string sul trigger button. Mostra "5 mag — 19 mag 2026"
  // se stesso anno, "5 mag 2025 — 19 mag 2026" altrimenti, "Seleziona
  // periodo" se vuoto.
  const label = React.useMemo(() => {
    const f = isoToDate(from);
    const t = isoToDate(to);
    if (!f && !t) return placeholder;
    if (f && !t) return `Dal ${format(f, "d MMM yyyy", { locale: it })}`;
    if (!f && t) return `Fino al ${format(t, "d MMM yyyy", { locale: it })}`;
    if (f && t) {
      const sameYear = f.getFullYear() === t.getFullYear();
      if (sameYear) {
        return `${format(f, "d MMM", { locale: it })} → ${format(t, "d MMM yyyy", { locale: it })}`;
      }
      return `${format(f, "d MMM yyyy", { locale: it })} → ${format(t, "d MMM yyyy", { locale: it })}`;
    }
    return placeholder;
  }, [from, to, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 justify-start gap-2 font-normal text-sm",
            !from && !to && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={(r) => {
            onChange({
              from: dateToIso(r?.from),
              to: dateToIso(r?.to),
            });
            // Chiudi quando entrambe le date sono settate
            if (r?.from && r?.to) {
              setOpen(false);
            }
          }}
          defaultMonth={range?.from ?? new Date()}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
