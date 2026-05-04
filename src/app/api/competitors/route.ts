import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractPageIdentifier } from "@/lib/meta/url";
import { resolvePageId } from "@/lib/meta/resolve-page-id";
import { competitorsTag } from "@/lib/library/cached-data";
import { cleanInstagramUsername } from "@/lib/instagram/service";
import { cleanTikTokUsername } from "@/lib/tiktok/service";
import { cleanSnapchatHandle } from "@/lib/snapchat/service";
import { cleanYouTubeChannelUrl } from "@/lib/youtube/service";
import { cleanAdvertiserDomain } from "@/lib/apify/google-ads-service";
import { coerceCountryForStorage } from "@/lib/meta/country-codes";

const schema = z.object({
  page_name: z.string().min(1).max(160),
  // page_url (Facebook) is OPTIONAL since migration 0036 — the
  // platform is multi-channel; Meta page URL is only needed if
  // the user wants to scan Meta ads. Empty string also accepted
  // so a form submit with the field cleared doesn't blow up the
  // z.string().url() validator.
  page_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  tiktok_advertiser_id: z.string().max(80).nullable().optional(),
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

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Look up user's workspace + role
  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Page-ID resolution only when a Facebook URL is provided. Brands
  // without it (multi-channel-only) just save page_id = NULL and
  // skip Meta-specific lookups; the Meta scan path will refuse later.
  let pageId: string | null = null;
  const pageUrl = parsed.data.page_url ?? null;
  if (pageUrl) {
    pageId = extractPageIdentifier(pageUrl).pageId ?? null;
    if (!pageId) {
      const resolved = await resolvePageId(pageUrl, parsed.data.page_name);
      if (resolved) pageId = resolved;
    }
  }

  const cleanedTtAdvId = parsed.data.tiktok_advertiser_id
    ? parsed.data.tiktok_advertiser_id.replace(/\D/g, "")
    : null;

  const { data, error } = await supabase
    .from("mait_competitors")
    .insert({
      workspace_id: profile.workspace_id,
      page_name: parsed.data.page_name,
      page_url: pageUrl,
      page_id: pageId,
      country: coerceCountryForStorage(parsed.data.country ?? null),
      category: parsed.data.category ?? null,
      client_id: parsed.data.client_id ?? null,
      instagram_username: parsed.data.instagram_username
        ? cleanInstagramUsername(parsed.data.instagram_username)
        : null,
      tiktok_username: parsed.data.tiktok_username
        ? cleanTikTokUsername(parsed.data.tiktok_username)
        : null,
      tiktok_advertiser_id: cleanedTtAdvId && cleanedTtAdvId.length > 0 ? cleanedTtAdvId : null,
      snapchat_handle: parsed.data.snapchat_handle
        ? cleanSnapchatHandle(parsed.data.snapchat_handle)
        : null,
      youtube_channel_url: parsed.data.youtube_channel_url
        ? cleanYouTubeChannelUrl(parsed.data.youtube_channel_url)
        : null,
      google_advertiser_id: parsed.data.google_advertiser_id ?? null,
      google_domain: parsed.data.google_domain
        ? cleanAdvertiserDomain(parsed.data.google_domain)
        : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api/competitors]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  revalidateTag(competitorsTag(profile.workspace_id));
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: existing } = await supabase
    .from("mait_competitors")
    .select("workspace_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("mait_competitors").delete().eq("id", id);
  if (error) {
    console.error("[api/competitors]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (existing?.workspace_id) revalidateTag(competitorsTag(existing.workspace_id));
  return NextResponse.json({ ok: true });
}
