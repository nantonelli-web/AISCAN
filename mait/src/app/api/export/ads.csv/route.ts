import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const competitorId = url.searchParams.get("competitor_id");

  let q = supabase
    .from("mait_ads_external")
    .select(
      "ad_archive_id, headline, ad_text, description, cta, landing_url, image_url, video_url, platforms, languages, status, start_date, end_date, created_at"
    )
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (competitorId) q = q.eq("competitor_id", competitorId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "ad_archive_id",
    "headline",
    "ad_text",
    "description",
    "cta",
    "landing_url",
    "image_url",
    "video_url",
    "platforms",
    "languages",
    "status",
    "start_date",
    "end_date",
    "created_at",
  ];
  const rows = (data ?? []).map((r) =>
    headers.map((h) => csvCell((r as Record<string, unknown>)[h])).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  const filename = competitorId
    ? `mait-ads-${competitorId}.csv`
    : "mait-ads.csv";

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
