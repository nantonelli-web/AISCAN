import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  if (parsed.data.deleteAds) {
    // Get all jobs to find time windows for ad deletion
    const { data: jobs } = await admin
      .from("mait_scrape_jobs")
      .select("id, competitor_id, started_at, completed_at")
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
        .eq("competitor_id", job.competitor_id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    }
  }

  const { error } = await admin
    .from("mait_scrape_jobs")
    .delete()
    .in("id", parsed.data.ids);

  if (error) {
    console.error("[api/scrape-jobs/bulk]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: parsed.data.ids.length });
}
