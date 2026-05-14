"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Piccola info-icon con popover cliccabile. Niente librerie esterne:
 * un button toggle + un div assoluto sotto, chiuso al click fuori o
 * a Esc. Pensato per inline su KPI tile / titoli di card / label di
 * filtro dove servono 1-2 frasi di chiarimento.
 *
 * Per blocchi piu' lunghi (paragrafi multipli, liste), passare un
 * ReactNode come `content` — il popover allinea il testo come body.
 *
 * Posizionamento: di default `bottom-start`. La larghezza del
 * popover e' clampata a 320px max cosi' un testo lungo non sfora
 * sulla mobile.
 */
export function InfoPopover({
  content,
  ariaLabel,
  className,
}: {
  content: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape, standard popover hygiene. Lo
  // mounting/unmounting del listener segue lo stato `open` per non
  // tenerlo registrato quando non serve.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel ?? "Informazioni"}
        aria-expanded={open}
        className="inline-flex items-center justify-center size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full mt-2 z-50 w-[min(320px,80vw)] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3 text-xs leading-relaxed"
        >
          {content}
        </div>
      )}
    </div>
  );
}
