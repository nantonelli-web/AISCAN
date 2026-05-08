import { NextResponse } from "next/server";
import { listKnownCampaignTypes } from "@/lib/perf/campaign-decoder";

/** GET /api/perf/campaign-types — lista delle tipologie supportate
 *  per popolare la dropdown di override. */
export async function GET() {
  return NextResponse.json({ types: listKnownCampaignTypes() });
}
