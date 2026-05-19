import { Zap, SlidersHorizontal, LayoutGrid, ArrowRight } from "lucide-react";

/**
 * Guida del flusso brand-detail in 3 box affiancati: Scan →
 * Interrogazione → Risultati. Aiuta l'utente nuovo a capire
 * dove fare cosa, in che ordine. Le 3 icone sono le stesse delle
 * CollapsibleSectionCard sottostanti cosi e' immediato il match
 * visivo "box guida → sezione concreta".
 *
 * Compatto e print:hidden — è un'aiuto di onboarding, non parte
 * del contenuto stampato.
 */
export function BrandFlowGuide({
  scanLabel,
  scanDescription,
  filtersLabel,
  filtersDescription,
  resultsLabel,
  resultsDescription,
}: {
  scanLabel: string;
  scanDescription: string;
  filtersLabel: string;
  filtersDescription: string;
  resultsLabel: string;
  resultsDescription: string;
}) {
  const steps = [
    {
      icon: <Zap className="size-4" />,
      step: "1",
      label: scanLabel,
      description: scanDescription,
    },
    {
      icon: <SlidersHorizontal className="size-4" />,
      step: "2",
      label: filtersLabel,
      description: filtersDescription,
    },
    {
      icon: <LayoutGrid className="size-4" />,
      step: "3",
      label: resultsLabel,
      description: resultsDescription,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 print:hidden">
      {steps.map((s, i) => (
        <div
          key={s.step}
          className="relative rounded-lg border border-border bg-muted/20 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-md bg-muted text-foreground grid place-items-center shrink-0">
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Step {s.step}
              </p>
              <p className="text-sm font-semibold text-foreground leading-tight">
                {s.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {s.description}
              </p>
            </div>
          </div>
          {/* Freccia tra i box (solo desktop). L'ultimo box non
              la ha. */}
          {i < steps.length - 1 && (
            <ArrowRight className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground bg-background rounded-full p-0.5 border border-border" />
          )}
        </div>
      ))}
    </div>
  );
}
