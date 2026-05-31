import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import {
  getCachedBenchmarks,
  getCachedOrganicBenchmarks,
  getCachedTiktokBenchmarks,
} from "@/lib/analytics/cached-benchmarks";
import { buildBenchmarksPptx } from "@/lib/pptx/benchmarks-export";
import { bufferToArrayBuffer } from "@/lib/pptx/common";

export const maxDuration = 180;

const CHANNEL_PRESET: Record<
  string,
  { label: string; color: string }
> = {
  meta: { label: "Meta Ads", color: "0866FF" },
  google: { label: "Google Ads", color: "1A73E8" },
  instagram: { label: "Instagram", color: "E1306C" },
  tiktok: { label: "TikTok", color: "010101" },
};

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

/**
 * GET /api/benchmarks/export/pptx
 * Query params: channel, brands (csv), countries (csv), from, to, status
 * Replica i filtri della pagina /benchmarks. Calcola gli aggregati
 * via gli stessi compute* della pagina e produce un .pptx.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "meta";
  const brandsRaw = url.searchParams.get("brands");
  const countriesRaw = url.searchParams.get("countries");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");

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

  // Parse + validate
  const brandIds = brandsRaw ? brandsRaw.split(",").filter(Boolean) : undefined;
  const countries = countriesRaw
    ? countriesRaw
        .split(",")
        .map((c) => c.toUpperCase())
        .filter(Boolean)
    : undefined;
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(today.getDate() - 30);
  const dateFrom = from && isValidIsoDate(from) ? from : thirtyAgo.toISOString().slice(0, 10);
  const dateTo = to && isValidIsoDate(to) ? to : today.toISOString().slice(0, 10);

  const ch = CHANNEL_PRESET[channel];
  if (!ch) {
    return NextResponse.json(
      {
        error: `Channel '${channel}' non supportato dall'export PPTX. Disponibili: meta, google, instagram, tiktok.`,
      },
      { status: 400 },
    );
  }

  // Brand names (for cover & headers)
  const admin = createAdminClient();
  const { data: brandsData } = await admin
    .from("mait_competitors")
    .select("id, page_name")
    .eq("workspace_id", profile.workspace_id)
    .order("page_name");
  const allBrands = (brandsData ?? []) as { id: string; page_name: string }[];
  const filteredBrands = brandIds
    ? allBrands.filter((b) => brandIds.includes(b.id))
    : allBrands;
  const brandNames = filteredBrands.map((b) => b.page_name);

  // Compute aggregates per channel
  let buf: Buffer;
  try {
    if (channel === "meta" || channel === "google") {
      const data = await getCachedBenchmarks(
        profile.workspace_id,
        channel,
        brandIds,
        dateFrom,
        dateTo,
        countries,
        status === "active" || status === "inactive" ? status : undefined,
      );
      buf = await buildBenchmarksPptx({
        kind: "ads",
        data,
        channel,
        channelLabel: ch.label,
        channelColor: ch.color,
        dateFrom,
        dateTo,
        brandNames,
        countries: countries ?? null,
      });
    } else if (channel === "instagram") {
      const data = await getCachedOrganicBenchmarks(
        profile.workspace_id,
        brandIds,
        dateFrom,
        dateTo,
      );
      buf = await buildBenchmarksPptx({
        kind: "organic",
        data,
        channel,
        channelLabel: ch.label,
        channelColor: ch.color,
        dateFrom,
        dateTo,
        brandNames,
        countries: countries ?? null,
      });
    } else {
      const data = await getCachedTiktokBenchmarks(
        profile.workspace_id,
        brandIds,
        dateFrom,
        dateTo,
      );
      buf = await buildBenchmarksPptx({
        kind: "tiktok",
        data,
        channel,
        channelLabel: ch.label,
        channelColor: ch.color,
        dateFrom,
        dateTo,
        brandNames,
        countries: countries ?? null,
      });
    }
  } catch (e) {
    console.error("[benchmarks/export/pptx]", e);
    return NextResponse.json(
      {
        error: `Errore generazione PPTX: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 500 },
    );
  }

  const safeName = `Benchmark_${ch.label}_${dateFrom}_${dateTo}`
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
