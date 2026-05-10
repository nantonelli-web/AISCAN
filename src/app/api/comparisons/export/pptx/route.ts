import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { buildComparePptx } from "@/lib/pptx/compare-export";
import { bufferToArrayBuffer } from "@/lib/pptx/common";

export const maxDuration = 120;

const CHANNEL_PRESET: Record<
  string,
  { label: string; color: string }
> = {
  meta: { label: "Meta Ads", color: "0866FF" },
  google: { label: "Google Ads", color: "1A73E8" },
  instagram: { label: "Instagram", color: "E1306C" },
  tiktok: { label: "TikTok", color: "010101" },
  snapchat: { label: "Snapchat", color: "FFFC00" },
  youtube: { label: "YouTube", color: "FF0000" },
  serp: { label: "Google SERP", color: "1A73E8" },
};

interface ComparisonRow {
  id: string;
  workspace_id: string;
  competitor_ids: string[];
  channel: string | null;
  date_from: string | null;
  date_to: string | null;
  countries: string[] | null;
  technical_data: unknown;
  copy_analysis: unknown;
  visual_analysis: unknown;
}

/**
 * GET /api/comparisons/export/pptx
 * Query: ids=uuid1,uuid2[,uuid3] (competitor_ids ordinati identici
 * al criterio di cache di /api/comparisons), channel.
 *
 * Genera un PPTX con cover + slide tecnica + slide copy AI +
 * slide visual AI + slide benchmark dalla comparison salvata.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids");
  const channel = url.searchParams.get("channel") ?? "meta";
  if (!idsRaw) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort(); // ordering deterministico per match cache

  if (ids.length < 2) {
    return NextResponse.json({ error: "Need at least 2 brand IDs" }, { status: 400 });
  }

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

  const admin = createAdminClient();
  const { data: comp } = await admin
    .from("mait_comparisons")
    .select(
      "id, workspace_id, competitor_ids, channel, date_from, date_to, countries, technical_data, copy_analysis, visual_analysis",
    )
    .eq("workspace_id", profile.workspace_id)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("channel", channel)
    .maybeSingle();
  if (!comp) {
    return NextResponse.json(
      {
        error:
          "Comparison non trovata. Apri il confronto dalla pagina Compare prima di esportarlo.",
      },
      { status: 404 },
    );
  }
  const c = comp as unknown as ComparisonRow;

  // Brand names
  const { data: brandsData } = await admin
    .from("mait_competitors")
    .select("id, page_name")
    .in("id", ids)
    .eq("workspace_id", profile.workspace_id);
  const brandsMap = new Map<string, string>(
    ((brandsData ?? []) as { id: string; page_name: string }[]).map((b) => [
      b.id,
      b.page_name,
    ]),
  );
  // Mantieni l'ordine degli ids nel pptx (lo stesso ordine canonical
  // della comparison cached).
  const brandNames = ids.map((cid) => brandsMap.get(cid) ?? "Brand");

  const ch = CHANNEL_PRESET[channel] ?? CHANNEL_PRESET.meta;

  const technical = Array.isArray(c.technical_data)
    ? (c.technical_data as never)
    : null;
  const buf = await buildComparePptx({
    technical,
    copyAnalysis: c.copy_analysis as never,
    visualAnalysis: c.visual_analysis as never,
    channel,
    channelLabel: ch.label,
    channelColor: ch.color,
    dateFrom: c.date_from,
    dateTo: c.date_to,
    brandNames,
    countries: c.countries,
  });

  const safeName = `Compare_${brandNames.join("_vs_")}_${
    c.date_from ?? ""
  }_${c.date_to ?? ""}`
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 100);
  return new NextResponse(bufferToArrayBuffer(buf), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${safeName}.pptx"`,
      "cache-control": "no-store",
    },
  });
}
