"use client";

import { useEffect, useState } from "react";
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

// 2026-05-19: utente ha chiesto coerenza visiva tra le 3 card top-
// level (Scan / Creativita / Risultati). Stili "gold" "info" "neutral"
// ora rendono TUTTI uguali (card border standard + icon container
// neutro) cosi le sezioni si leggono come una serie omogenea.
// L'ordine semantico delle sezioni e' gia' chiaro dalla loro
// posizione + icona + titolo: aggiungere tinting al frame creava
// dissonanza ottica.
const sharedCardStyle = {
  card: "border-border bg-card",
  headerHover: "hover:bg-muted/40",
  iconBg: "bg-muted",
  iconFg: "text-foreground",
};
const toneStyles: Record<
  Tone,
  {
    card: string;
    headerHover: string;
    iconBg: string;
    iconFg: string;
  }
> = {
  gold: sharedCardStyle,
  info: sharedCardStyle,
  neutral: sharedCardStyle,
};

export function CollapsibleSectionCard({
  icon,
  title,
  subtitle,
  tone = "neutral",
  defaultOpen = false,
  persistKey,
  children,
  rightSlot,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: Tone;
  defaultOpen?: boolean;
  /** Stable storage key per persistere lo stato aperto/chiuso in
   *  localStorage. Risolve il caso in cui il Suspense boundary
   *  esterno re-monta il componente su cambio URL (es. dopo
   *  navigazione al channel pivot) e il useState locale veniva
   *  reset a defaultOpen — l'utente perdeva il box aperto ogni
   *  volta che cliccava un filtro. */
  persistKey?: string;
  /** Optional right-aligned slot on the header (e.g. count badge,
   *  small action). Sits between subtitle and the chevron. */
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Hydrate da localStorage AL CLIENT (skip SSR) cosi se l'utente
  // aveva la card aperta, dopo un remount del Suspense la
  // ritrova aperta. Lasciamo il defaultOpen iniziale per non
  // creare flash di chiusura → poi se c'e' uno stato salvato lo
  // applichiamo.
  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`section-card:${persistKey}`);
    if (stored === "1") setOpen(true);
    else if (stored === "0") setOpen(false);
  }, [persistKey]);
  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    window.localStorage.setItem(
      `section-card:${persistKey}`,
      open ? "1" : "0",
    );
  }, [open, persistKey]);
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
