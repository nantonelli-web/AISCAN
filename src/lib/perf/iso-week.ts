/**
 * Helper per ricostruire date ISO da un token settimanale.
 *
 * Riferimento ISO 8601: la week 1 dell'anno e' quella che contiene
 * il primo giovedi' di gennaio. Equivalente: la week che contiene
 * il 4 gennaio. Le settimane iniziano il LUNEDI'.
 *
 * Usato dal parser Meta / Snapchat / future canali quando il file
 * esportato non ha la column Day o Reporting starts ma solo "Week
 * 14" → ricostruiamo "lunedi della week 14 dell'anno corrente"
 * cosi tutte le righe finiscono in time series con un date valido.
 */

/**
 * Ritorna l'ISO date (YYYY-MM-DD) del LUNEDI' della week ISO
 * specificata, oppure null se l'input non e' valido.
 *
 * Accetta token tipo:
 *   "week 14"          → year corrente
 *   "week 14 2026"     → year esplicito
 *   "Week 14, 2026"    → year esplicito (separatori vari)
 *   "settimana 14"     → IT label
 *   "14"               → solo numero, year corrente
 */
export function isoWeekToMonday(
  token: string,
  fallbackYear?: number,
): string | null {
  if (!token) return null;
  const s = String(token).trim();
  // Estrai numero week + opzionale year
  const m = /(?:week|settimana|w)?\s*(\d{1,2})(?:\D+(\d{4}))?/i.exec(s);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const y = m[2]
    ? Number.parseInt(m[2], 10)
    : (fallbackYear ?? new Date().getUTCFullYear());
  if (!Number.isFinite(w) || w < 1 || w > 53) return null;
  if (!Number.isFinite(y) || y < 1900 || y > 2200) return null;

  // 4 gennaio cade SEMPRE nella week 1 ISO. Trovo il lunedi' della
  // week 1, poi sommo (w-1)*7 giorni.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7; // domenica = 0, ISO la mette a 7
  const monW1 = new Date(jan4);
  monW1.setUTCDate(jan4.getUTCDate() - day + 1);
  const target = new Date(monW1);
  target.setUTCDate(monW1.getUTCDate() + (w - 1) * 7);
  return target.toISOString().slice(0, 10);
}

/** Inverso: ritorna il numero ISO della week dato un ISO date. */
export function isoWeekOfDate(isoDate: string): {
  week: number;
  year: number;
} | null {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // ISO 8601: thursday-based.
  const target = new Date(d.getTime());
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week: weekNo, year: target.getUTCFullYear() };
}
