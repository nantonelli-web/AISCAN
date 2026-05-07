/**
 * Detection collaborazioni nei post organici (IG + TikTok).
 *
 * Strategia: un post e' una "collaborazione" se contiene almeno un
 * account taggato/menzionato che NON e' il brand stesso. I tag in
 * foto (`tagged_users` su IG) e le @mention nel caption sono i
 * signal piu robusti — gia' estratti dagli actor Apify e
 * persistiti nelle tabelle organic.
 *
 * Out of scope per L1: classificazione brand-vs-influencer-vs-VIP
 * (parcheggiata in project_open_followups.md). Qui ci limitiamo a
 * "ci sono account esterni taggati o no".
 */

/**
 * Normalizza un handle social per il dedup.
 * - Rimuove `@` iniziali
 * - Trim whitespace
 * - Rimuove TUTTA la punteggiatura terminale, INCLUSO il punto.
 *   Gli handle IG/TikTok validi non terminano con `.` (Meta lo
 *   vieta). Quindi un trailing `.` e' sempre artefatto del parser.
 *   Internal dots (es. "courage.studio") restano intatti perche'
 *   la regex matcha solo la fine della stringa.
 * - Rimuove characters invisibili (zero-width, NBSP, ecc.) interni.
 * - Lowercase per match case-insensitive.
 *
 * Bug 2026-05-07 prima del fix: il regex precedente
 * `[^A-Za-z0-9_.]+$` includeva `.` nella whitelist, quindi non
 * spogliava trailing dots. Risultato: "verderame_milano" e
 * "verderame_milano." venivano dedupati come distinti.
 */
export function normalizeHandle(raw: string | null | undefined): string {
  if (!raw) return "";
  let h = raw.trim().replace(/^@+/, "");
  // Strip qualsiasi char NON-word (== [a-zA-Z0-9_]) terminale.
  // Notare: NIENTE `.` nella whitelist di [^...], quindi i punti
  // terminali vengono rimossi correttamente.
  h = h.replace(/[^A-Za-z0-9_]+$/, "");
  // Rimuovi anche eventuali sequenze di punti terminali residue
  // (sicurezza extra in caso di handle malformati).
  h = h.replace(/\.+$/, "");
  // Normalizza char invisibili interni (zero-width, NBSP) e
  // abbassa case.
  h = h.replace(/[​-‍﻿]/g, "").toLowerCase();
  return h;
}

/**
 * Estrae @-mention dal testo libero del caption come fallback
 * quando l'actor non popola `mentions[]`.
 *
 * Verificato 2026-05-07: l'actor TikTok per Elena Miro lascia
 * `mentions=[]` su post tipo "special guest: @florenciafacose" o
 * "Rosso Miro capsule @courage.studio @marie__seguy" — i tag
 * sono visibili nel caption ma non strutturati. Senza fallback
 * questi post sfuggono al detection collab. Stessa cosa puo'
 * succedere su IG quando l'actor manca tag in caption.
 *
 * Limite: per @mention seguite da display name con spazi (es.
 * "@Camila Coelho" dove l'handle reale e' "camilacoelho") la
 * regex prende solo la prima parola → dato degradato. Quando
 * l'actor estrae correttamente in `mentions[]`, quello e' la
 * fonte autoritativa.
 */
export function extractAtMentionsFromCaption(
  caption: string | null | undefined,
): string[] {
  if (!caption) return [];
  // Match @ seguito da [a-zA-Z0-9_.] ammessi in handle IG/TikTok.
  // Escludi @ all'inizio di email (preceduto da char word) tramite
  // lookbehind: (?<![A-Za-z0-9_.]) garantisce che @ sia preceduto
  // solo da whitespace o inizio stringa o punteggiatura non-handle.
  const matches = caption.matchAll(/(?<![A-Za-z0-9_.])@([A-Za-z0-9_.]+)/g);
  const out: string[] = [];
  for (const m of matches) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * Unione dedup di mentions + tagged_users + @-mention estratte dal
 * caption. La fonte caption e' un fallback per quando l'actor
 * lascia `mentions[]` vuoto pur essendoci tag visibili nel testo.
 */
export function collectAccounts(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
  caption?: string | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const m of mentions ?? []) {
    const h = normalizeHandle(m);
    if (h) set.add(h);
  }
  for (const m of taggedUsers ?? []) {
    const h = normalizeHandle(m);
    if (h) set.add(h);
  }
  if (caption) {
    for (const m of extractAtMentionsFromCaption(caption)) {
      const h = normalizeHandle(m);
      if (h) set.add(h);
    }
  }
  return [...set];
}

/** True se il post ha almeno un account taggato che NON e' il brand. */
export function isCollabPost(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
  selfHandle: string | null | undefined,
  caption?: string | null | undefined,
): boolean {
  const self = normalizeHandle(selfHandle);
  const accounts = collectAccounts(mentions, taggedUsers, caption);
  return accounts.some((a) => a !== self);
}

/** Restituisce solo gli account "esterni" (non self) di un post. */
export function externalAccounts(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
  selfHandle: string | null | undefined,
  caption?: string | null | undefined,
): string[] {
  const self = normalizeHandle(selfHandle);
  return collectAccounts(mentions, taggedUsers, caption).filter(
    (a) => a !== self,
  );
}

/**
 * Aggregato di collaboratori ricorrenti su una lista di post.
 * Restituisce un array ordinato per frequenza desc.
 */
export interface CollabFrequency {
  handle: string;
  count: number;
  platforms: Set<string>;
}

export function aggregateCollaborators(
  posts: Array<{
    mentions: string[] | null;
    tagged_users?: string[] | null;
    caption?: string | null;
    platform?: string;
  }>,
  selfHandle: string | null | undefined,
  defaultPlatform: string,
): CollabFrequency[] {
  const map = new Map<string, CollabFrequency>();
  for (const p of posts) {
    const externals = externalAccounts(
      p.mentions,
      p.tagged_users ?? null,
      selfHandle,
      p.caption ?? null,
    );
    const platform = p.platform ?? defaultPlatform;
    for (const handle of externals) {
      const existing = map.get(handle);
      if (existing) {
        existing.count += 1;
        existing.platforms.add(platform);
      } else {
        map.set(handle, {
          handle,
          count: 1,
          platforms: new Set([platform]),
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
