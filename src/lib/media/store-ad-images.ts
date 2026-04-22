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
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BUCKET = "media";
const BATCH_SIZE = 8;
const DOWNLOAD_TIMEOUT = 10_000; // 10s per image

/**
 * Reject URLs that could hit internal infrastructure (AWS/GCP metadata,
 * loopback, RFC1918 ranges). Returns true if the URL is a safe public target.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateIpv4(lower.slice(7));
  return false;
}

async function isPublicHttpUrl(rawUrl: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname;
  if (!host || host === "localhost") return false;
  // Literal IP in hostname
  const ipVer = isIP(host);
  if (ipVer === 4) return !isPrivateIpv4(host);
  if (ipVer === 6) return !isPrivateIpv6(host);
  // DNS resolve
  try {
    const { address, family } = await lookup(host);
    if (family === 4) return !isPrivateIpv4(address);
    if (family === 6) return !isPrivateIpv6(address);
    return false;
  } catch {
    return false;
  }
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
