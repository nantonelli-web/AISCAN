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

const BUCKET = "media";
const BATCH_SIZE = 8;
const DOWNLOAD_TIMEOUT = 10_000; // 10s per image

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const res = await fetch(imageUrl, { signal: controller.signal });
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
 * Process an array of ad rows: download images and replace image_url
 * with permanent Supabase Storage URLs. Mutates rows in-place.
 */
export async function storeAdImages(
  admin: SupabaseClient,
  workspaceId: string,
  rows: AdRow[],
  source: "meta" | "google" = "meta"
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
