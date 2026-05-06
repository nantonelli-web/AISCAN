/**
 * Local SEO audit per un Maps place: compute un completeness score
 * a partire dai dati gia' scrappati. Ogni item rappresenta una
 * "best practice" del Google Business Profile — phone, sito,
 * orari, foto, recensioni, owner response, rating, eta presenza.
 *
 * E' un check rule-based su dati verificabili: nessuna AI
 * opinion. Allineato al feedback "real data only" — cio' che e'
 * surface'd e' auditable contro la SERP / Google Maps live.
 */

export interface AuditItem {
  key: string;
  /** Etichetta i18n key sotto `mapsAudit.<key>`. */
  labelKey: string;
  ok: boolean;
}

export interface AuditResult {
  score: number;
  max: number;
  items: AuditItem[];
}

interface AuditPlace {
  phone: string | null;
  website: string | null;
  category_name: string | null;
  image_url: string | null;
  address: string | null;
  total_score: number | null;
  reviews_count: number;
}

interface AuditReview {
  response_from_owner_text: string | null;
}

export function computeLocalSeoAudit(
  place: AuditPlace,
  reviews: AuditReview[],
): AuditResult {
  const hasOwnerResponse = reviews.some(
    (r) => (r.response_from_owner_text ?? "").trim().length > 0,
  );

  const items: AuditItem[] = [
    { key: "phone", labelKey: "phone", ok: !!place.phone?.trim() },
    { key: "website", labelKey: "website", ok: !!place.website?.trim() },
    { key: "address", labelKey: "address", ok: !!place.address?.trim() },
    {
      key: "category",
      labelKey: "category",
      ok: !!place.category_name?.trim(),
    },
    { key: "image", labelKey: "image", ok: !!place.image_url?.trim() },
    {
      key: "claimed",
      labelKey: "claimed",
      ok: place.reviews_count > 0,
    },
    {
      key: "established",
      labelKey: "established",
      ok: place.reviews_count >= 10,
    },
    {
      key: "rating",
      labelKey: "rating",
      ok: place.total_score != null && place.total_score >= 4.0,
    },
    {
      key: "ownerResponse",
      labelKey: "ownerResponse",
      ok: hasOwnerResponse,
    },
  ];

  const score = items.filter((i) => i.ok).length;
  return { score, max: items.length, items };
}

/** Tier visivo per lo score: red/amber/green. */
export function auditTier(score: number, max: number): "low" | "mid" | "high" {
  const ratio = max === 0 ? 0 : score / max;
  if (ratio < 0.5) return "low";
  if (ratio < 0.8) return "mid";
  return "high";
}
