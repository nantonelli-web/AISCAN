import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getFacets } from "@/lib/library/cached-data";

export async function GET() {
  const { profile } = await getSessionUser();
  if (!profile?.workspace_id) {
    return NextResponse.json({ ctas: [], platforms: [], statuses: [] });
  }
  const facets = await getFacets(profile.workspace_id);
  return NextResponse.json(facets);
}
