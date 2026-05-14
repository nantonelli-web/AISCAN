import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/ai-copy-sample?brand=Karen&from=2026-04-14&to=2026-05-14&source=google
 *
 * Replica esattamente fetchBrandAdData in /api/comparisons/route.ts
 * cosi' vediamo cosa l'AI Copy / Visual analysis riceve come input.
 * Filtra brand per page_name ILIKE %brand%, applica dateFilter
 * (start_date overlap), restituisce sample con tutti i campi copy
 * (headline, ad_text, description, cta) cosi' possiamo capire se la
 * asymmetry guard scatta perche':
 *   A. la query ritorna 0 ads (date filter / source filter sbagliato)
 *   B. la query ritorna ads ma tutti hanno copy fields null
 *      (Apify silva non popola headline/body per quegli ads)
 *
 * Output:
 *   - counts: ads_total / ads_with_any_copy / ads_with_full_copy
 *   - sample (12 entries): headline, ad_text, description, cta,
 *     format, status, start_date, end_date, ad_archive_id
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const url = new URL(req.url);
  const brandLike = (url.searchParams.get("brand") ?? "").trim();
  const sourceParam = url.searchParams.get("source") as
    | "meta"
    | "google"
    | null;
  const source = sourceParam === "meta" || sourceParam === "google" ? sourceParam : "google";
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");
  if (!brandLike) {
    return NextResponse.json({ error: "brand param richiesto" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: brands } = await admin
    .from("mait_competitors")
    .select("id, page_name")
    .eq("workspace_id", workspaceId)
    .ilike("page_name", `%${brandLike}%`);
  const brandsList = (brands ?? []) as { id: string; page_name: string }[];
  if (brandsList.length === 0) {
    return NextResponse.json({ error: `Nessun brand match %${brandLike}%` });
  }

  const results = [];
  for (const b of brandsList) {
    let q = admin
      .from("mait_ads_external")
      .select(
        "ad_archive_id, headline, ad_text, description, cta, image_url, status, start_date, end_date, raw_data, created_at, source",
      )
      .eq("competitor_id", b.id)
      .order("created_at", { ascending: false })
      .limit(12);
    q = q.eq("source", source);
    if (dateFrom && dateTo) {
      q = q.lte("start_date", dateTo);
      q = q.or(
        `end_date.gte.${dateFrom},end_date.is.null,status.eq.ACTIVE`,
      );
    }
    const { data: ads } = await q;
    const list = (ads ?? []) as Array<{
      ad_archive_id: string | null;
      headline: string | null;
      ad_text: string | null;
      description: string | null;
      cta: string | null;
      image_url: string | null;
      status: string | null;
      start_date: string | null;
      end_date: string | null;
      raw_data: Record<string, unknown> | null;
      created_at: string;
      source: string | null;
    }>;

    const adsWithAnyCopy = list.filter(
      (a) =>
        (a.headline && a.headline.length > 0) ||
        (a.ad_text && a.ad_text.length > 0) ||
        (a.description && a.description.length > 0) ||
        (a.cta && a.cta.length > 0),
    );
    const adsWithFullCopy = list.filter(
      (a) =>
        a.headline &&
        a.ad_text &&
        a.cta,
    );

    // Anche il count totale ads del brand senza il limite 12 (per
    // capire se il problema e' "limit + ordine" oppure "filtro").
    const { count: totalInWindow } = await admin
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", b.id)
      .eq("source", source)
      .lte("start_date", dateTo ?? new Date().toISOString().slice(0, 10))
      .or(
        dateFrom
          ? `end_date.gte.${dateFrom},end_date.is.null,status.eq.ACTIVE`
          : `end_date.is.null,status.eq.ACTIVE`,
      );

    // E quanti tra TUTTI gli ads nel range hanno qualche copy.
    const { count: totalWithCopyInWindow } = await admin
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", b.id)
      .eq("source", source)
      .lte("start_date", dateTo ?? new Date().toISOString().slice(0, 10))
      .or(
        dateFrom
          ? `end_date.gte.${dateFrom},end_date.is.null,status.eq.ACTIVE`
          : `end_date.is.null,status.eq.ACTIVE`,
      )
      .or(
        "headline.not.is.null,ad_text.not.is.null,description.not.is.null,cta.not.is.null",
      );

    results.push({
      brand: b.page_name,
      brand_id: b.id,
      counts: {
        total_in_window: totalInWindow ?? 0,
        total_with_any_copy_in_window: totalWithCopyInWindow ?? 0,
        sample_loaded_top12: list.length,
        sample_with_any_copy: adsWithAnyCopy.length,
        sample_with_full_copy: adsWithFullCopy.length,
      },
      asymmetry_guard_would_flag:
        adsWithAnyCopy.length === 0,
      sample: list.map((a) => ({
        ad_archive_id: a.ad_archive_id,
        status: a.status,
        start_date: a.start_date,
        end_date: a.end_date,
        created_at: a.created_at,
        format: (a.raw_data as Record<string, unknown> | null)?.format ?? null,
        headline: a.headline,
        ad_text: a.ad_text
          ? a.ad_text.slice(0, 120) + (a.ad_text.length > 120 ? "…" : "")
          : null,
        description: a.description
          ? a.description.slice(0, 120) +
            (a.description.length > 120 ? "…" : "")
          : null,
        cta: a.cta,
      })),
    });
  }

  return NextResponse.json({
    query: { brand_like: brandLike, source, date_from: dateFrom, date_to: dateTo },
    results,
  });
}
