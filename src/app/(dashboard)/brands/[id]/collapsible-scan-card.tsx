"use client";

import { useState } from "react";
import { ChevronDown, Radar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Wrapper della card SCAN nella brand-detail page. Si apre cliccando
 * sull'header (Radar + titolo + freccia). Default chiuso — la riga
 * principale di azioni che l'utente fa di solito non e' "lancia
 * scan" ma "guarda le creativita' gia' scrapate", quindi tenerla
 * collassata libera spazio above-the-fold per i KPI e il channel
 * filter sotto.
 *
 * Il body viene MONTATO solo quando aperto cosi' ScanDropdown (che
 * registra event listener globali) non occupa risorse a riposo.
 */
export function CollapsibleScanCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-gold/30 bg-gold-soft/40 print:hidden overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-6 py-4 flex items-center gap-3 hover:bg-gold-soft/60 transition-colors cursor-pointer"
      >
        <div className="size-9 rounded-lg bg-gold text-gold-foreground grid place-items-center shrink-0 shadow-sm">
          <Radar className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight leading-tight">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown
          className={`size-5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
