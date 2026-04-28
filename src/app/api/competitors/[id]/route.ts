import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { competitorsTag } from "@/lib/library/cached-data";
import { cleanInstagramUsername } from "@/lib/instagram/service";
import { cleanTikTokUsername } from "@/lib/tiktok/service";
import { cleanSnapchatHandle } from "@/lib/snapchat/service";
import { cleanYouTubeChannelUrl } from "@/lib/youtube/service";
import { cleanAdvertiserDomain } from "@/lib/apify/google-ads-service";
import { coerceCountryForStorage } from "@/lib/meta/country-codes";

const patchSchema = z.object({
  // Monitor config fields
  frequency: z.enum(["manual", "daily", "weekly"]).optional(),
  max_items: z.number().int().min(10).max(1000).optional(),
  // Editable competitor fields
  page_name: z.string().min(1).max(160).optional(),
  page_url: z.string().url().optional(),
  country: z.string().max(200).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  instagram_username: z.string().max(60).nullable().optional(),
  tiktok_username: z.string().max(60).nullable().optional(),
  snapchat_handle: z.string().max(60).nullable().optional(),
  youtube_channel_url: z.string().max(200).nullable().optional(),
  google_advertiser_id: z.string().max(80).nullable().optional(),
  google_domain: z.string().max(200).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const {
    frequency, max_items, page_name, page_url, country, category,
    client_id, instagram_username, tiktok_username, snapchat_handle,
    youtube_channel_url, google_advertiser_id, google_domain,
  } = parsed.data;

  // Separate monitor_config fields from direct fields
  const directUpdate: Record<string, unknown> = {};
  if (page_name !== undefined) directUpdate.page_name = page_name;
  if (page_url !== undefined) directUpdate.page_url = page_url;
  if (country !== undefined) directUpdate.country = coerceCountryForStorage(country);
  if (category !== undefined) directUpdate.category = category;
  if (client_id !== undefined) directUpdate.client_id = client_id;
  if (instagram_username !== undefined) {
    // Accept @handle, handle, or full profile URL; store only the clean handle.
    directUpdate.instagram_username = instagram_username
      ? cleanInstagramUsername(instagram_username)
      : null;
  }
  if (tiktok_username !== undefined) {
    directUpdate.tiktok_username = tiktok_username
      ? cleanTikTokUsername(tiktok_username)
      : null;
  }
  if (snapchat_handle !== undefined) {
    directUpdate.snapchat_handle = snapchat_handle
      ? cleanSnapchatHandle(snapchat_handle)
      : null;
  }
  if (youtube_channel_url !== undefined) {
    directUpdate.youtube_channel_url = youtube_channel_url
      ? cleanYouTubeChannelUrl(youtube_channel_url)
      : null;
  }
  if (google_advertiser_id !== undefined) directUpdate.google_advertiser_id = google_advertiser_id;
  if (google_domain !== undefined) {
    // Accept full URL or bare domain, store only the bare domain so the
    // Google Ads scraper can query it directly.
    directUpdate.google_domain = google_domain
      ? cleanAdvertiserDomain(google_domain)
      : null;
  }

  // Handle monitor_config merge if frequency or max_items changed
  if (frequency !== undefined || max_items !== undefined) {
    const { data: current } = await supabase
      .from("mait_competitors")
      .select("monitor_config")
      .eq("id", id)
      .single();

    directUpdate.monitor_config = {
      ...(current?.monitor_config ?? {}),
      ...(frequency !== undefined ? { frequency } : {}),
      ...(max_items !== undefined ? { max_items } : {}),
    };
  }

  if (Object.keys(directUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { data: updated, error } = await supabase
    .from("mait_competitors")
    .update(directUpdate)
    .eq("id", id)
    .select("workspace_id")
    .single();

  if (error) {
    console.error("[api/competitors/:id]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (updated?.workspace_id) revalidateTag(competitorsTag(updated.workspace_id));
  return NextResponse.json({ ok: true });
}

/**
 * Hard delete a competitor and everything attached to it. The user's
 * stance is "non occupiamo risorse inutilmente" — no orphan rows, no
 * orphan storage objects, no stale cached comparisons.
 *
 * Foreign keys on the related tables are inconsistent — `mait_organic_posts`
 * cascades, but `mait_ads_external`, `mait_scrape_jobs`, `mait_alerts`
 * are `on delete set null`. So those need explicit DELETEs. Saved
 * comparisons reference competitors via an array column with no FK,
 * so they are also wiped manually. Storage objects (profile picture +
 * ad/post creatives) live in the `media` bucket under predictable
 * paths and are removed best-effort — failures here do not block the
 * row deletion.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS-checked read so non-members of the workspace cannot delete.
  const { data: existing, error: existingErr } = await supabase
    .from("mait_competitors")
    .select("workspace_id")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const workspaceId = existing.workspace_id as string;

  const admin = createAdminClient();

  // Capture every storage path we will need to remove BEFORE the rows
  // are deleted — once the rows are gone we cannot enumerate the
  // adArchiveId / post_id values that map to bucket keys.
  const [{ data: adKeys }, { data: postKeys }] = await Promise.all([
    admin
      .from("mait_ads_external")
      .select("ad_archive_id, source")
      .eq("competitor_id", id),
    admin
      .from("mait_organic_posts")
      .select("post_id, platform")
      .eq("competitor_id", id),
  ]);

  // Storage layout (`storeAdImages` → `downloadAndStore`):
  //   media/{workspaceId}/{source}/{adArchiveId}.{ext}
  //   media/{workspaceId}/profiles/profile_{competitorId}.{ext}
  // Three plausible extensions per file; the storage API simply
  // ignores keys that do not exist, so listing all three is safe.
  const STORAGE_EXTS = ["jpg", "png", "webp"] as const;
  const storageKeys: string[] = [];
  for (const ext of STORAGE_EXTS) {
    storageKeys.push(`${workspaceId}/profiles/profile_${id}.${ext}`);
  }
  for (const r of adKeys ?? []) {
    const archive = (r as { ad_archive_id: string | null }).ad_archive_id;
    const source = (r as { source: string | null }).source ?? "meta";
    if (!archive) continue;
    for (const ext of STORAGE_EXTS) {
      storageKeys.push(`${workspaceId}/${source}/${archive}.${ext}`);
    }
  }
  for (const p of postKeys ?? []) {
    const postId = (p as { post_id: string | null }).post_id;
    const platform =
      (p as { platform: string | null }).platform ?? "instagram";
    if (!postId) continue;
    for (const ext of STORAGE_EXTS) {
      storageKeys.push(`${workspaceId}/${platform}/${postId}.${ext}`);
    }
  }

  // Wipe related DB rows. Order: ads → jobs → alerts → comparisons →
  // competitor. mait_ads_external cascades to mait_collection_ads and
  // mait_ads_tags via its own FKs. mait_organic_posts cascades from
  // the competitor delete itself.
  const adsDel = await admin
    .from("mait_ads_external")
    .delete()
    .eq("competitor_id", id);
  if (adsDel.error) {
    console.error("[api/competitors/:id ads cleanup]", adsDel.error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const jobsDel = await admin
    .from("mait_scrape_jobs")
    .delete()
    .eq("competitor_id", id);
  if (jobsDel.error) {
    console.error("[api/competitors/:id jobs cleanup]", jobsDel.error);
  }

  const alertsDel = await admin
    .from("mait_alerts")
    .delete()
    .eq("competitor_id", id);
  if (alertsDel.error) {
    console.error("[api/competitors/:id alerts cleanup]", alertsDel.error);
  }

  // Saved comparisons that include this brand are deleted outright.
  // They reference the brand by an array column with no FK, so without
  // explicit cleanup they would point to a non-existent competitor and
  // their cached technical_data would still hold the deleted brand's
  // metrics — useless to anyone.
  const compDel = await admin
    .from("mait_comparisons")
    .delete()
    .contains("competitor_ids", [id]);
  if (compDel.error) {
    console.error("[api/competitors/:id comparisons cleanup]", compDel.error);
  }

  const { error } = await admin
    .from("mait_competitors")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[api/competitors/:id]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Storage cleanup is best-effort: failures here would leave orphan
  // bytes in the bucket but should not block the user's destructive
  // intent. Supabase remove() accepts up to 1000 keys per call.
  if (storageKeys.length > 0) {
    const CHUNK = 900;
    for (let i = 0; i < storageKeys.length; i += CHUNK) {
      const chunk = storageKeys.slice(i, i + CHUNK);
      const { error: storageErr } = await admin.storage
        .from("media")
        .remove(chunk);
      if (storageErr) {
        console.error(
          "[api/competitors/:id storage cleanup]",
          storageErr.message,
        );
      }
    }
  }

  revalidateTag(competitorsTag(workspaceId));
  return NextResponse.json({ ok: true });
}
