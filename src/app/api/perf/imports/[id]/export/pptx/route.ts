import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { loadDashboardData } from "@/lib/perf/dashboard-loader";
import { buildPerfPptx } from "@/lib/perf/pptx-export";
import type { ComparisonMode } from "@/lib/perf/comparisons";

export const maxDuration = 120;

interface AnalysisRow {
  section: string;
  content: string;
  edited_by_user: boolean;
}

/**
 * GET /api/perf/imports/[id]/export/pptx
 * Genera un .pptx con il dashboard + le analisi AI salvate.
 *
 * Query params (opzionali, per allineare l'export al dashboard
 * filtrato che l'utente sta vedendo):
 *  - compare: none|previous|week|yoy|custom
 *  - compare_from / compare_to / week_current / week_compare
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = (url.searchParams.get("compare") ?? "none") as ComparisonMode;
  const customFrom = url.searchParams.get("compare_from") ?? undefined;
  const customTo = url.searchParams.get("compare_to") ?? undefined;
  const weekCurrent = url.searchParams.get("week_current");
  const weekCompare = url.searchParams.get("week_compare");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { profile } = await getSessionUser();
  if (!profile.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  // 1. Carica dashboard payload
  const result = await loadDashboardData(supabase, {
    importId: id,
    mode,
    customFrom,
    customTo,
    weekCurrent,
    weekCompare,
  });
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.imp.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // 2. Carica le analisi salvate
  const { data: analysesData } = await admin
    .from("mait_perf_analyses")
    .select("section, content, edited_by_user")
    .eq("import_id", id);
  const analyses = (analysesData ?? []) as AnalysisRow[];

  // 3. Carica nomi cliente + brand per la cover. brand_id puo'
  // essere null per import legacy pre-migration 0043: in quel caso
  // la cover mostra solo il nome cliente.
  const { data: impHead } = await admin
    .from("mait_perf_imports")
    .select("brand_id")
    .eq("id", id)
    .maybeSingle();
  const brandId = (impHead as { brand_id: string | null } | null)?.brand_id;

  const [{ data: clientRow }, { data: brandRow }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("name")
      .eq("id", result.imp.client_id)
      .maybeSingle(),
    brandId
      ? admin
          .from("mait_competitors")
          .select("page_name")
          .eq("id", brandId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const clientName = clientRow?.name ?? "Cliente";
  const brandName = brandRow?.page_name ?? clientName;

  // 4. Genera il pptx
  const buf = await buildPerfPptx({
    data: result.data,
    analyses,
    clientName,
    brandName,
    channel: (result.imp.channel as
      | "meta"
      | "snapchat"
      | "google"
      | "tiktok") ?? "meta",
  });

  // 5. Returns as download
  const safeName = `${brandName} ${result.imp.period_from} ${result.imp.period_to}`
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 100);
  // Cast Node Buffer -> ArrayBuffer (Web Streams BodyInit). Slice
  // garantisce un ArrayBuffer "puro" (non SharedArrayBuffer).
  const ab = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${safeName}.pptx"`,
      "cache-control": "no-store",
    },
  });
}
