/**
 * Downloads ad images from temporary CDN URLs (fbcdn, etc.) and stores them
 * permanently in Supabase Storage. Replaces image_url in-place so the ad
 * row is upserted with a permanent URL.
 *
 * - Skips URLs that are already in Supabase Storage
 * - Processes in parallel batches to avoid overwhelming the CDN
 * - Failures are silent — the original URL is kept as fallback
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicHttpUrl as isPublicHttpUrlBase } from "@/lib/security/ssrf";

const BUCKET = "media";
const BATCH_SIZE = 8;
const DOWNLOAD_TIMEOUT = 10_000; // 10s per image

/**
 * Ad-image variant of the SSRF guard: allows the trusted-CDN allowlist
 * to skip DNS resolution. Necessary because some Facebook edge nodes
 * (e.g. *.fna.fbcdn.net regional appliances) don't always resolve from
 * a Vercel datacenter — the lookup would throw and the image silently
 * drop (production showed ~12% of Sezane Meta ads losing image_url to
 * exactly this path). The core guard lives in @/lib/security/ssrf.
 */
function isPublicHttpUrl(rawUrl: string): Promise<boolean> {
  return isPublicHttpUrlBase(rawUrl, { allowCdn: true });
}

interface AdRow {
  ad_archive_id: string;
  image_url: string | null;
  [key: string]: unknown;
}

/** Ensure the media bucket exists (idempotent) */
let bucketChecked = false;
async function ensureBucket(admin: SupabaseClient) {
  if (bucketChecked) return;
  try {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10_000_000, // 10MB max
    });
  } catch {
    // Bucket already exists — fine
  }
  bucketChecked = true;
}

/** Download a single image and upload to Supabase Storage */
async function downloadAndStore(
  admin: SupabaseClient,
  workspaceId: string,
  adArchiveId: string,
  imageUrl: string,
  source: string
): Promise<string | null> {
  try {
    if (!(await isPublicHttpUrl(imageUrl))) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const res = await fetch(imageUrl, { signal: controller.signal, redirect: "error" });
    clearTimeout(timer);

    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null; // Skip tiny/empty responses

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    const path = `${workspaceId}/${source}/${adArchiveId}.${ext}`;

    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) return null;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null; // Download failed (timeout, network, etc.)
  }
}

/**
 * Download and store a profile picture permanently.
 * Returns the permanent URL or null on failure.
 */
export async function storeProfilePicture(
  admin: SupabaseClient,
  workspaceId: string,
  competitorId: string,
  profileUrl: string
): Promise<string | null> {
  if (!profileUrl) return null;
  if (profileUrl.includes("supabase.co/storage")) return profileUrl;
  await ensureBucket(admin);
  return downloadAndStore(admin, workspaceId, `profile_${competitorId}`, profileUrl, "profiles");
}

/**
 * Download & store a COLLABORATOR's profile picture permanently
 * (L3 enrichment). Le URL del profilo IG hanno signature time-limited
 * e dopo poche ore danno 403 → senza mirror le card mostrerebbero solo
 * le iniziali. Chiave per platform+handle (cache workspace-scoped, come
 * mait_collab_accounts: lo stesso account e' condiviso tra brand).
 * Ritorna l'URL permanente, o null se il download fallisce.
 */
export async function storeCollabProfilePicture(
  admin: SupabaseClient,
  workspaceId: string,
  platform: string,
  handle: string,
  profileUrl: string
): Promise<string | null> {
  if (!profileUrl) return null;
  if (profileUrl.includes("supabase.co/storage")) return profileUrl;
  await ensureBucket(admin);
  const key = `collab_${platform}_${handle}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return downloadAndStore(admin, workspaceId, key, profileUrl, "collab-profiles");
}

/**
 * Process an array of ad rows: download images and replace image_url
 * with permanent Supabase Storage URLs. Mutates rows in-place.
 */
export async function storeAdImages(
  admin: SupabaseClient,
  workspaceId: string,
  rows: AdRow[],
  source: "meta" | "google" | "instagram" = "meta"
): Promise<{ stored: number; skipped: number; failed: number }> {
  await ensureBucket(admin);

  let stored = 0;
  let skipped = 0;
  let failed = 0;

  // Filter rows that need downloading
  const toProcess = rows.filter((r) => {
    if (!r.image_url) {
      skipped++;
      return false;
    }
    // Already in Supabase Storage — skip
    if (r.image_url.includes("supabase.co/storage")) {
      skipped++;
      return false;
    }
    return true;
  });

  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((row) =>
        downloadAndStore(
          admin,
          workspaceId,
          row.ad_archive_id,
          row.image_url!,
          source
        ).then((url) => ({ row, url }))
      )
    );

    for (const { row, url } of results) {
      if (url) {
        row.image_url = url;
        stored++;
      } else {
        failed++;
      }
    }
  }

  return { stored, skipped, failed };
}
