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

/** Normalizza un handle (rimuove @, trim, lowercase, rimuove punto finale). */
export function normalizeHandle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

/** Unione dedup di mentions + tagged_users normalizzati, esclusi handle vuoti. */
export function collectAccounts(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
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
  return [...set];
}

/** True se il post ha almeno un account taggato che NON e' il brand. */
export function isCollabPost(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
  selfHandle: string | null | undefined,
): boolean {
  const self = normalizeHandle(selfHandle);
  const accounts = collectAccounts(mentions, taggedUsers);
  return accounts.some((a) => a !== self);
}

/** Restituisce solo gli account "esterni" (non self) di un post. */
export function externalAccounts(
  mentions: string[] | null | undefined,
  taggedUsers: string[] | null | undefined,
  selfHandle: string | null | undefined,
): string[] {
  const self = normalizeHandle(selfHandle);
  return collectAccounts(mentions, taggedUsers).filter((a) => a !== self);
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
