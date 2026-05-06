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

interface Props {
  data: PopularTimesHistogram | null | undefined;
  liveText?: string | null;
  livePercent?: number | null;
  locale?: string;
  title: string;
}

export function PopularTimesHeatmap({
  data,
  liveText,
  livePercent,
  locale,
  title,
}: Props) {
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    return null;
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {liveText ? (
          <p className="text-[10px] text-gold">
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
                    // Scala alpha del gold col gradiente di
                    // occupancy. 0% = celletta vuota muted; 100%
                    // = gold pieno. Background HSL mantiene il
                    // tema senza hardcodare colori.
                    const alpha = pct === 0 ? 0.06 : 0.15 + (pct / 100) * 0.85;
                    return (
                      <td key={h} className="p-px">
                        <div
                          className="size-3.5 rounded-sm"
                          style={{
                            backgroundColor: `rgba(217, 168, 47, ${alpha})`,
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
    </div>
  );
}
