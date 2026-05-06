/**
 * Heatmap del foot-traffic settimanale per un Maps place. Sorgente
 * dati: campo `popular_times` su mait_maps_places — JSONB con shape:
 *   { Su: [{hour, occupancyPercent}, ...], Mo: [...], ..., Sa: [...] }
 * dove ogni giorno ha 18 entry (ore 6..23).
 *
 * Render: griglia 7 (giorni) × 18 (ore) con celle colorate in scala
 * gold (l'orange della palette del prodotto). Tooltip via title=...
 * sulla cella per non aggiungere dipendenze JS.
 */

interface PopularTimesEntry {
  hour: number;
  occupancyPercent: number;
}

type PopularTimesHistogram = Record<string, PopularTimesEntry[]>;

const DAYS_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_LABELS_IT: Record<(typeof DAYS_ORDER)[number], string> = {
  Mo: "Lun",
  Tu: "Mar",
  We: "Mer",
  Th: "Gio",
  Fr: "Ven",
  Sa: "Sab",
  Su: "Dom",
};
const DAY_LABELS_EN: Record<(typeof DAYS_ORDER)[number], string> = {
  Mo: "Mon",
  Tu: "Tue",
  We: "Wed",
  Th: "Thu",
  Fr: "Fri",
  Sa: "Sat",
  Su: "Sun",
};

interface LegendLabels {
  quiet: string;
  moderate: string;
  busy: string;
  peak: string;
}

interface Props {
  data: PopularTimesHistogram | null | undefined;
  liveText?: string | null;
  livePercent?: number | null;
  locale?: string;
  title: string;
  legend: LegendLabels;
  /** Frase esplicativa sotto il titolo (da dove arrivano i dati). */
  description: string;
  /** Mostrato quando data e' vuoto invece di nascondere il pannello —
   *  cosi l'utente vede che e' stato verificato e Google non espone
   *  il dato per questo place specifico. */
  unavailableLabel: string;
}

/**
 * Mappa occupancyPercent (0..100) a colore della cella. Palette
 * traffic-light a 4 fasce (verde / giallo / arancio / rosso) +
 * fascia "vuoto" molto chiara: il monocolor gold dell'iterazione
 * precedente non differenziava abbastanza le ore busy vs quiet
 * (feedback utente 2026-05-06). Le tonalita sono Tailwind 400/500
 * per saturazione decisa e contrasto su sfondo light/dark.
 */
function colorForOccupancy(pct: number): string {
  if (pct <= 0) return "rgba(115, 115, 115, 0.10)"; // empty
  if (pct < 25) return "rgb(74, 222, 128)"; // green-400
  if (pct < 50) return "rgb(250, 204, 21)"; // yellow-400
  if (pct < 75) return "rgb(251, 146, 60)"; // orange-400
  return "rgb(239, 68, 68)"; // red-500
}

export function PopularTimesHeatmap({
  data,
  liveText,
  livePercent,
  locale,
  title,
  legend,
  description,
  unavailableLabel,
}: Props) {
  const hasData =
    data && typeof data === "object" && Object.keys(data).length > 0;

  // Header sempre presente (titolo + descrizione fonte): se manca
  // il dato per questo place mostriamo solo "non disponibile"
  // invece di nascondere il pannello — cosi e' chiaro che e'
  // stato verificato e che il vuoto e' un limite di Google, non
  // una nostra omissione.
  const header = (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
        {title}
      </p>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {description}
      </p>
    </div>
  );

  if (!hasData) {
    return (
      <div className="space-y-2">
        {header}
        <p className="text-[11px] text-muted-foreground italic">
          {unavailableLabel}
        </p>
      </div>
    );
  }

  const labels = locale === "en" ? DAY_LABELS_EN : DAY_LABELS_IT;

  // Estrai il range di ore presenti nei dati: di solito 6..23 ma
  // alcuni place chiudono presto / aprono tardi e l'actor omette
  // entry per le ore non aperte. Calcoliamo l'union delle ore.
  const hourSet = new Set<number>();
  for (const day of DAYS_ORDER) {
    const entries = data[day];
    if (Array.isArray(entries)) {
      for (const e of entries) {
        if (typeof e?.hour === "number") hourSet.add(e.hour);
      }
    }
  }
  const hours = [...hourSet].sort((a, b) => a - b);
  if (hours.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
            {title}
          </p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {description}
          </p>
        </div>
        {liveText ? (
          <p className="text-[10px] text-gold font-medium shrink-0">
            {liveText}
            {typeof livePercent === "number" ? ` (${livePercent}%)` : ""}
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="text-[9px] tabular-nums">
          <thead>
            <tr>
              <th className="pr-2"></th>
              {hours.map((h) => (
                <th
                  key={h}
                  className="px-0.5 text-center font-normal text-muted-foreground/70 align-bottom"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS_ORDER.map((day) => {
              const entries = data[day] ?? [];
              const byHour = new Map<number, number>();
              for (const e of entries) {
                if (typeof e?.hour === "number") {
                  byHour.set(e.hour, e.occupancyPercent ?? 0);
                }
              }
              return (
                <tr key={day}>
                  <td className="pr-2 text-muted-foreground font-medium">
                    {labels[day]}
                  </td>
                  {hours.map((h) => {
                    const pct = byHour.get(h) ?? 0;
                    return (
                      <td key={h} className="p-px">
                        <div
                          className="size-3.5 rounded-sm"
                          style={{
                            backgroundColor: colorForOccupancy(pct),
                          }}
                          title={`${labels[day]} ${h}:00 — ${pct}%`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Legenda fasce colore — esplicita la mappa colore→livello,
          altrimenti la heatmap multicolore non si interpreta. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: "rgb(74, 222, 128)" }}
          />
          {legend.quiet}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: "rgb(250, 204, 21)" }}
          />
          {legend.moderate}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: "rgb(251, 146, 60)" }}
          />
          {legend.busy}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: "rgb(239, 68, 68)" }}
          />
          {legend.peak}
        </span>
      </div>
    </div>
  );
}
