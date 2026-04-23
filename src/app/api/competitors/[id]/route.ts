import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { competitorsTag } from "@/lib/library/cached-data";
import { cleanInstagramUsername } from "@/lib/instagram/service";
import { cleanAdvertiserDomain } from "@/lib/apify/google-ads-service";

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
    client_id, instagram_username, google_advertiser_id, google_domain,
  } = parsed.data;

  // Separate monitor_config fields from direct fields
  const directUpdate: Record<string, unknown> = {};
  if (page_name !== undefined) directUpdate.page_name = page_name;
  if (page_url !== undefined) directUpdate.page_url = page_url;
  if (country !== undefined) directUpdate.country = country;
  if (category !== undefined) directUpdate.category = category;
  if (client_id !== undefined) directUpdate.client_id = client_id;
  if (instagram_username !== undefined) {
    // Accept @handle, handle, or full profile URL; store only the clean handle.
    directUpdate.instagram_username = instagram_username
      ? cleanInstagramUsername(instagram_username)
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

  const { data: existing } = await supabase
    .from("mait_competitors")
    .select("workspace_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("mait_competitors").delete().eq("id", id);
  if (error) {
    console.error("[api/competitors/:id]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (existing?.workspace_id) revalidateTag(competitorsTag(existing.workspace_id));
  return NextResponse.json({ ok: true });
}
