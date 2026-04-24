import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Diagnostic endpoint for the "refresh rate" metric. For each competitor
 * in the caller's workspace, returns the raw counts that drive the
 * ads-per-week number so we can cross-check surprising values without
 * touching the DB directly.
 *
 * GET /api/competitors/refresh-rate-debug
 * Optional: ?source=meta|google (default: meta)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") ?? "meta";
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

    // Paginated full fetch (workspace ads for this source). We only need
    // the fields that feed the refresh-rate diagnostic.
    async function fetchAll(): Promise<
      {
        competitor_id: string | null;
        ad_archive_id: string | null;
        start_date: string | null;
        created_at: string;
      }[]
    > {
      const PAGE = 1000;
      const SAFETY_CAP = 100_000;
      const rows: {
        competitor_id: string | null;
        ad_archive_id: string | null;
        start_date: string | null;
        created_at: string;
      }[] = [];
      for (let from = 0; from < SAFETY_CAP; from += PAGE) {
        const { data, error } = await admin
          .from("mait_ads_external")
          .select("competitor_id, ad_archive_id, start_date, created_at")
          .eq("workspace_id", workspaceId)
          .eq("source", source)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE) break;
      }
      return rows;
    }

    const [{ data: comps }, rows] = await Promise.all([
      admin
        .from("mait_competitors")
        .select("id, page_name, country")
        .eq("workspace_id", profile.workspace_id)
        .order("page_name"),
      fetchAll(),
    ]);

    const compMap = new Map(
      (comps ?? []).map((c) => [c.id as string, { name: c.page_name as string, country: (c.country as string | null) ?? null }])
    );

    const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
    type Bucket = {
      competitorId: string;
      competitor: string;
      country: string | null;
      totalRows: number;
      uniqueArchiveIds: number;
      withStartDate: number;
      startDateInLast90d: number;
      createdAtInLast90d: number;
      adsPerWeek: number;
      sampleArchiveIds: string[];
    };
    const acc = new Map<string, {
      totalRows: number;
      uniqueArchiveIds: Set<string>;
      withStartDate: number;
      startDateInLast90d: number;
      createdAtInLast90d: number;
      archiveIdsForSample: Set<string>;
    }>();

    for (const r of rows) {
      const key = r.competitor_id ?? "unknown";
      const bucket = acc.get(key) ?? {
        totalRows: 0,
        uniqueArchiveIds: new Set<string>(),
        withStartDate: 0,
        startDateInLast90d: 0,
        createdAtInLast90d: 0,
        archiveIdsForSample: new Set<string>(),
      };
      bucket.totalRows++;
      if (r.ad_archive_id) bucket.uniqueArchiveIds.add(r.ad_archive_id);
      if (r.start_date) {
        bucket.withStartDate++;
        const t = new Date(r.start_date).getTime();
        if (Number.isFinite(t) && t >= ninetyDaysAgo) bucket.startDateInLast90d++;
      }
      const ct = new Date(r.created_at).getTime();
      if (Number.isFinite(ct) && ct >= ninetyDaysAgo) bucket.createdAtInLast90d++;
      if (r.ad_archive_id && bucket.archiveIdsForSample.size < 3) {
        bucket.archiveIdsForSample.add(r.ad_archive_id);
      }
      acc.set(key, bucket);
    }

    const weeks = 90 / 7;
    const result: Bucket[] = [...acc.entries()]
      .map(([id, b]) => ({
        competitorId: id,
        competitor: compMap.get(id)?.name ?? "N/A",
        country: compMap.get(id)?.country ?? null,
        totalRows: b.totalRows,
        uniqueArchiveIds: b.uniqueArchiveIds.size,
        withStartDate: b.withStartDate,
        startDateInLast90d: b.startDateInLast90d,
        createdAtInLast90d: b.createdAtInLast90d,
        adsPerWeek: Math.round((b.startDateInLast90d / weeks) * 10) / 10,
        sampleArchiveIds: [...b.archiveIdsForSample],
      }))
      .sort((a, b) => b.adsPerWeek - a.adsPerWeek);

    return NextResponse.json({ ok: true, source, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[refresh-rate-debug]", e);
    return NextResponse.json({ error: "Server error", detail: message }, { status: 500 });
  }
}
