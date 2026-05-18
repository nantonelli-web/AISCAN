"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Wrapper generico per le sezioni collassabili della brand-detail
 * page. Stesso pattern visivo: header cliccabile con icona + titolo
 * + sottotitolo + chevron, body montato solo quando aperto.
 *
 * Tono visivo controllato da `tone`:
 *   - "gold" → Scan (azione primaria, gold border + gold-soft bg)
 *   - "info" → Creativita & Insight (lettura dei dati, info-soft bg)
 *   - "neutral" → fallback senza tinting
 *
 * Il body viene MONTATO solo quando aperto cosi' i child component
 * (es. ScanDropdown, BrandChannelsSection) non occupano risorse a
 * riposo. Eccezione: BrandChannelsSection e' un server component
 * dentro Suspense — il fetch parte comunque a livello server,
 * questo gating client-side serve solo a non riempire lo schermo.
 */
type Tone = "gold" | "info" | "neutral";

const toneStyles: Record<
  Tone,
  {
    card: string;
    headerHover: string;
    iconBg: string;
    iconFg: string;
  }
> = {
  gold: {
    card: "border-gold/30 bg-gold-soft/40",
    headerHover: "hover:bg-gold-soft/60",
    iconBg: "bg-gold",
    iconFg: "text-gold-foreground",
  },
  info: {
    card: "border-info/25 bg-info-soft/40",
    headerHover: "hover:bg-info-soft/60",
    iconBg: "bg-info-soft tone-info",
    iconFg: "",
  },
  neutral: {
    card: "border-border bg-muted/30",
    headerHover: "hover:bg-muted/50",
    iconBg: "bg-muted",
    iconFg: "text-foreground",
  },
};

export function CollapsibleSectionCard({
  icon,
  title,
  subtitle,
  tone = "neutral",
  defaultOpen = false,
  children,
  rightSlot,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: Tone;
  defaultOpen?: boolean;
  /** Optional right-aligned slot on the header (e.g. count badge,
   *  small action). Sits between subtitle and the chevron. */
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = toneStyles[tone];

  return (
    <Card className={`${styles.card} print:hidden overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full text-left px-6 py-4 flex items-center gap-3 transition-colors cursor-pointer ${styles.headerHover}`}
      >
        <div
          className={`size-9 rounded-lg ${styles.iconBg} ${styles.iconFg} grid place-items-center shrink-0 shadow-sm`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight leading-tight">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {rightSlot && (
          <div className="shrink-0 flex items-center">{rightSlot}</div>
        )}
        <ChevronDown
          className={`size-5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
