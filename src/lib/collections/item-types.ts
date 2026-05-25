/**
 * Collections — tassonomia polimorfica degli item salvabili.
 *
 * Storicamente le Collections salvavano SOLO ads Meta/Google
 * (mait_collection_ads.ad_id → mait_ads_external). Per coerenza con
 * tutti i canali (Library/Batch), ora una collection puo' contenere
 * qualsiasi creativita': ads paid (Meta/Google/TikTok/Snapchat) e
 * contenuti organic (IG/TikTok/Snapchat/YouTube). Il legame e'
 * polimorfico: mait_collection_items(item_type, item_id) (migration
 * 0060), dove item_id e' l'`id` (uuid) della riga nella tabella del
 * tipo. Niente FK singola — la validazione "esiste + e' del workspace"
 * la fa la API per-tipo usando questa mappa.
 *
 * Single source of truth condivisa da: API /api/collections/[id]/items,
 * collection detail page, e il bottone SaveToCollection.
 */

export type CollectionItemType =
  | "ad" // mait_ads_external (Meta + Google)
  | "tiktok_ad" // mait_tiktok_ads (DSA library + CC)
  | "snapchat_ad" // mait_snapchat_ads
  | "instagram_post" // mait_organic_posts (platform=instagram)
  | "tiktok_post" // mait_tiktok_posts
  | "snapchat_profile" // mait_snapchat_profiles
  | "youtube_video"; // mait_youtube_videos

/** item_type → tabella sorgente (la riga si identifica con la sua `id`). */
export const COLLECTION_ITEM_TABLE: Record<CollectionItemType, string> = {
  ad: "mait_ads_external",
  tiktok_ad: "mait_tiktok_ads",
  snapchat_ad: "mait_snapchat_ads",
  instagram_post: "mait_organic_posts",
  tiktok_post: "mait_tiktok_posts",
  snapchat_profile: "mait_snapchat_profiles",
  youtube_video: "mait_youtube_videos",
};

export const COLLECTION_ITEM_TYPES = Object.keys(
  COLLECTION_ITEM_TABLE,
) as CollectionItemType[];

export function isCollectionItemType(v: unknown): v is CollectionItemType {
  return typeof v === "string" && v in COLLECTION_ITEM_TABLE;
}
