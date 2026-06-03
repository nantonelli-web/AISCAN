import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Side-by-side comparison of the exact Benchmarks volume query run via
 * the authenticated client (goes through RLS) vs the admin client
 * (bypasses RLS). If both return the same rows we know the issue is
 * on our JavaScript side; if they diverge, RLS or the client layer is
 * duplicating rows.
 *
 * GET /api/competitors/query-probe
 * Optional: ?source=meta|google&ids=uuid1,uuid2,... (limits by competitor_id)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") ?? "meta";
    const rawIds = url.searchParams.get("ids");

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("mait_users")
      .select("workspace_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.workspace_id || !["super_admin", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const workspaceId = profile.workspace_id;
    const admin = createAdminClient();

    // If the caller did not pass explicit ids, auto-discover all the
    // workspace's competitor ids so the probe is trivially reproducible
    // by just hitting the URL.
    let competitorIds: string[] | null = rawIds
      ? rawIds.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    if (!competitorIds || competitorIds.length === 0) {
      const { data: comps } = await admin
        .from("mait_competitors")
        .select("id")
        .eq("workspace_id", workspaceId);
      competitorIds = (comps ?? []).map((c) => c.id as string);
    }

    // Run the same query via both clients. Single .range() call to 9999
    // — if the response caps at 1000 we will see the cap, not loop over.
    async function run(c: ReturnType<typeof createAdminClient>) {
      let q = c
        .from("mait_ads_external")
        .select("id, competitor_id, ad_archive_id, source")
        .eq("workspace_id", workspaceId)
        .eq("source", source)
        .order("id")
        .range(0, 9999);
      if (competitorIds && competitorIds.length > 0) {
        q = q.in("competitor_id", competitorIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      const total = data?.length ?? 0;
      const uniqueIds = new Set((data ?? []).map((r) => r.id as string)).size;
      const uniqueArchiveIds = new Set(
        (data ?? []).map((r) => r.ad_archive_id as string)
      ).size;
      const byCompetitor: Record<string, number> = {};
      for (const r of data ?? []) {
        const k = (r.competitor_id as string | null) ?? "null";
        byCompetitor[k] = (byCompetitor[k] ?? 0) + 1;
      }
      return { total, uniqueIds, uniqueArchiveIds, byCompetitor };
    }

    // Authoritative exact count via PostgREST count=exact, head=true.
    // This does NOT return rows; it returns only the total count in the
    // response headers. It is the ground truth for "how many rows match".
    async function exactCount(c: ReturnType<typeof createAdminClient>, withFilter: boolean) {
      let q = c
        .from("mait_ads_external")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("source", source);
      if (withFilter && competitorIds && competitorIds.length > 0) {
        q = q.in("competitor_id", competitorIds);
      }
      const { count } = await q;
      return count ?? 0;
    }

    const [viaAdmin, viaAuth, totalInWorkspace, totalMatchingFilter] = await Promise.all([
      run(admin),
      run(supabase as unknown as ReturnType<typeof createAdminClient>),
      exactCount(admin, false),
      exactCount(admin, true),
    ]);

    const diff: string[] = [];
    if (viaAdmin.total !== viaAuth.total) {
      diff.push(`TOTAL: admin=${viaAdmin.total} auth=${viaAuth.total}`);
    }
    if (viaAdmin.uniqueIds !== viaAuth.uniqueIds) {
      diff.push(`UNIQUE_IDS: admin=${viaAdmin.uniqueIds} auth=${viaAuth.uniqueIds}`);
    }

    return NextResponse.json({
      ok: true,
      exactCounts: { totalInWorkspace, totalMatchingFilter },
      viaAdmin,
      viaAuth,
      diff,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "Query probe failed",
      { channel: "competitors/query-probe", event: "probe.failed" },
      e,
    );
    return NextResponse.json({ error: "Server error", detail: message }, { status: 500 });
  }
}
