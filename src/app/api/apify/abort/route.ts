import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  competitor_id: z.string().uuid(),
});

/**
 * Abort all running Apify jobs for a competitor.
 * 1. Finds running jobs in mait_scrape_jobs
 * 2. Calls Apify POST /actor-runs/{runId}/abort for each
 * 3. Marks jobs as failed in DB
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const admin = createAdminClient();
  const token = process.env.APIFY_API_TOKEN;

  // Find all running jobs for this competitor
  const { data: runningJobs } = await admin
    .from("mait_scrape_jobs")
    .select("id, apify_run_id")
    .eq("competitor_id", parsed.data.competitor_id)
    .eq("status", "running");

  const aborted: string[] = [];

  for (const job of runningJobs ?? []) {
    // Abort Apify run if we have the run ID and token
    if (job.apify_run_id && token) {
      try {
        await fetch(
          `https://api.apify.com/v2/actor-runs/${job.apify_run_id}/abort`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          }
        );
      } catch {
        // Apify abort failed — still mark job as failed
      }
    }

    // Mark job as failed
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Aborted by user",
      })
      .eq("id", job.id);

    aborted.push(job.id);
  }

  return NextResponse.json({ ok: true, aborted: aborted.length });
}
