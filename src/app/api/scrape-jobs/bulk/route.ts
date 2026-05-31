import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceId } from "@/lib/auth/workspace";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  deleteAds: z.boolean(),
});

export async function DELETE(req: Request) {
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

  const admin = createAdminClient();

  // Tenant isolation: admin client bypasses RLS. Resolve the caller's
  // workspace and constrain every fetch/delete to it, so an attacker
  // can't pass other workspaces' job ids and delete them en masse.
  const workspaceId = await resolveWorkspaceId(admin, user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  if (parsed.data.deleteAds) {
    // Get all jobs to find time windows for ad deletion (own workspace only)
    const { data: jobs } = await admin
      .from("mait_scrape_jobs")
      .select("id, competitor_id, started_at, completed_at")
      .eq("workspace_id", workspaceId)
      .in("id", parsed.data.ids);

    for (const job of jobs ?? []) {
      if (!job.competitor_id || !job.started_at) continue;
      const start = new Date(job.started_at);
      const end = job.completed_at
        ? new Date(job.completed_at)
        : new Date(start.getTime() + 10 * 60 * 1000);
      start.setMinutes(start.getMinutes() - 1);
      end.setMinutes(end.getMinutes() + 1);

      await admin
        .from("mait_ads_external")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("competitor_id", job.competitor_id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    }
  }

  const { data: deleted, error } = await admin
    .from("mait_scrape_jobs")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("id", parsed.data.ids)
    .select("id");

  if (error) {
    console.error("[api/scrape-jobs/bulk]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: (deleted ?? []).length });
}
