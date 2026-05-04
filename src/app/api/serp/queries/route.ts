import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cleanQuery } from "@/lib/serp/service";

const postSchema = z.object({
  query: z.string().min(1).max(200),
  country: z.string().length(2).optional(),
  language: z.string().length(2).optional(),
  device: z.enum(["DESKTOP", "MOBILE"]).optional(),
  label: z.string().max(160).nullable().optional(),
  competitor_ids: z.array(z.string().uuid()).optional(),
});

/** GET — list every SERP query in the workspace + scan summary. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pull queries + the M:N brand list joined in one trip. Junction
  // is workspace-scoped under RLS so the array is naturally filtered.
  const { data, error } = await supabase
    .from("mait_serp_queries")
    .select(
      `
      id, query, country, language, device, label, is_active, last_scraped_at, created_at,
      brands:mait_serp_query_brands(competitor_id, mait_competitors(id, page_name, google_domain))
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/serp/queries GET]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ queries: data ?? [] });
}

/** POST — create a new SERP query (optionally pre-linked to brands). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

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

  const cleaned = cleanQuery(parsed.data.query);
  if (!cleaned) {
    return NextResponse.json({ error: "Query non valida" }, { status: 400 });
  }

  const country = (parsed.data.country ?? "IT").toUpperCase();
  const language = (parsed.data.language ?? "it").toLowerCase();
  const device = parsed.data.device ?? "DESKTOP";

  const { data: inserted, error } = await supabase
    .from("mait_serp_queries")
    .insert({
      workspace_id: profile.workspace_id,
      query: cleaned,
      country,
      language,
      device,
      label: parsed.data.label ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // Friendly message for the unique-constraint violation: same
    // (query, country, language, device) already exists.
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Query già esistente per questa combinazione paese/lingua/device." },
        { status: 409 },
      );
    }
    console.error("[api/serp/queries POST]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Optional bulk M:N association.
  if (parsed.data.competitor_ids && parsed.data.competitor_ids.length > 0) {
    const linkRows = parsed.data.competitor_ids.map((cid) => ({
      query_id: inserted.id,
      competitor_id: cid,
      workspace_id: profile.workspace_id,
    }));
    const { error: linkErr } = await supabase
      .from("mait_serp_query_brands")
      .insert(linkRows);
    if (linkErr) {
      console.error("[api/serp/queries POST link]", linkErr);
      // Non-fatal: the query is created; user can re-link manually.
    }
  }

  return NextResponse.json({ id: inserted.id });
}
