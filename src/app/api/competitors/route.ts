import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractPageIdentifier } from "@/lib/meta/url";
import { resolvePageId } from "@/lib/meta/resolve-page-id";
import { competitorsTag } from "@/lib/library/cached-data";
import { cleanInstagramUsername } from "@/lib/instagram/service";
import { cleanAdvertiserDomain } from "@/lib/apify/google-ads-service";
import { coerceCountryForStorage } from "@/lib/meta/country-codes";

const schema = z.object({
  page_name: z.string().min(1).max(160),
  page_url: z.string().url(),
  country: z.string().max(200).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  instagram_username: z.string().max(60).nullable().optional(),
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

  let { pageId } = extractPageIdentifier(parsed.data.page_url);

  // If URL is a username (not numeric), resolve to page ID via Apify
  if (!pageId) {
    const resolved = await resolvePageId(parsed.data.page_url, parsed.data.page_name);
    if (resolved) pageId = resolved;
  }

  const { data, error } = await supabase
    .from("mait_competitors")
    .insert({
      workspace_id: profile.workspace_id,
      page_name: parsed.data.page_name,
      page_url: parsed.data.page_url,
      page_id: pageId ?? null,
      country: coerceCountryForStorage(parsed.data.country ?? null),
      category: parsed.data.category ?? null,
      client_id: parsed.data.client_id ?? null,
      instagram_username: parsed.data.instagram_username
        ? cleanInstagramUsername(parsed.data.instagram_username)
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
