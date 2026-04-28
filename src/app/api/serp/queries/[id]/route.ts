import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  label: z.string().max(160).nullable().optional(),
  is_active: z.boolean().optional(),
  competitor_ids: z.array(z.string().uuid()).optional(),
});

/**
 * GET — query detail with the latest run + result list. Drives the
 * SERP detail page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: query, error: qErr }, { data: brands }, { data: latestRun }] =
    await Promise.all([
      supabase
        .from("mait_serp_queries")
        .select(
          "id, workspace_id, query, country, language, device, label, is_active, last_scraped_at, created_at",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("mait_serp_query_brands")
        .select("competitor_id, mait_competitors(id, page_name, google_domain)")
        .eq("query_id", id),
      supabase
        .from("mait_serp_runs")
        .select(
          "id, scraped_at, organic_count, paid_count, paid_products_count, has_ai_overview, related_queries, people_also_ask",
        )
        .eq("query_id", id)
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (qErr || !query) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  let results: unknown[] = [];
  if (latestRun?.id) {
    const { data: r } = await supabase
      .from("mait_serp_results")
      .select(
        "id, result_type, position, url, normalized_domain, displayed_url, title, description, image_url, date_text, emphasized_keywords, site_links, product_info",
      )
      .eq("run_id", latestRun.id)
      .order("position", { ascending: true, nullsFirst: false });
    results = r ?? [];
  }

  return NextResponse.json({
    query,
    brands: brands ?? [],
    latestRun,
    results,
  });
}

/**
 * PATCH — update label / is_active / replace brand associations.
 *
 * Brand list replacement is an idempotent set-write: delete all
 * current links for this query, insert the new ones. Cheaper than
 * computing a diff and avoids stale rows from earlier scans.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.is_active !== undefined)
    update.is_active = parsed.data.is_active;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("mait_serp_queries")
      .update(update)
      .eq("id", id);
    if (error) {
      console.error("[api/serp/queries/:id PATCH]", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }

  if (parsed.data.competitor_ids !== undefined) {
    const { data: q } = await supabase
      .from("mait_serp_queries")
      .select("workspace_id")
      .eq("id", id)
      .single();
    if (!q?.workspace_id) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }
    const { error: delErr } = await supabase
      .from("mait_serp_query_brands")
      .delete()
      .eq("query_id", id);
    if (delErr) {
      console.error("[api/serp/queries/:id PATCH delete links]", delErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    if (parsed.data.competitor_ids.length > 0) {
      const linkRows = parsed.data.competitor_ids.map((cid) => ({
        query_id: id,
        competitor_id: cid,
        workspace_id: q.workspace_id as string,
      }));
      const { error: insErr } = await supabase
        .from("mait_serp_query_brands")
        .insert(linkRows);
      if (insErr) {
        console.error("[api/serp/queries/:id PATCH insert links]", insErr);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/** DELETE — drop the query + cascade to runs/results/links. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("mait_serp_queries")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[api/serp/queries/:id DELETE]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
