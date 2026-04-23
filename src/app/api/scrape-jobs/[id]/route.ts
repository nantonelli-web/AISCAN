import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const deleteAds = url.searchParams.get("deleteAds") === "true";

  const admin = createAdminClient();

  // Get job details first (to know competitor_id and time range for ad deletion)
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .select("id, competitor_id, started_at, completed_at")
    .eq("id", id)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // If requested, delete ads that were created around the time of this scan
  if (deleteAds && job.competitor_id && job.started_at) {
    const start = new Date(job.started_at);
    const end = job.completed_at
      ? new Date(job.completed_at)
      : new Date(start.getTime() + 10 * 60 * 1000); // fallback: 10min window

    // Expand window by 1 minute on each side to catch edge cases
    start.setMinutes(start.getMinutes() - 1);
    end.setMinutes(end.getMinutes() + 1);

    await admin
      .from("mait_ads_external")
      .delete()
      .eq("competitor_id", job.competitor_id)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
  }

  // Delete the job itself
  const { error } = await admin
    .from("mait_scrape_jobs")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/scrape-jobs/:id]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
