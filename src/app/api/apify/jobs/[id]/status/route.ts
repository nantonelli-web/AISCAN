import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/apify/jobs/[id]/status
 *
 * Endpoint leggero per il polling lato client di uno scan async.
 * Restituisce solo i campi necessari a decidere se lo scan e' ancora
 * in corso o se e' arrivato il webhook di completamento.
 *
 * Auth via cookie Supabase + RLS sulla tabella mait_scrape_jobs
 * (i job sono visibili solo al workspace del chiamante).
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mait_scrape_jobs")
    .select(
      "id, status, source, competitor_id, records_count, error, started_at, completed_at, apify_run_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    job_id: data.id,
    status: data.status,
    source: data.source,
    competitor_id: data.competitor_id,
    records_count: data.records_count ?? 0,
    error: data.error,
    started_at: data.started_at,
    completed_at: data.completed_at,
    apify_run_id: data.apify_run_id,
    /** True quando il client puo' smettere di fare polling (job in
     *  uno stato terminale). */
    terminal:
      data.status === "succeeded" ||
      data.status === "failed" ||
      data.status === "partial",
  });
}
