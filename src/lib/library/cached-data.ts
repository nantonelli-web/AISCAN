import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type Facets = {
  ctas: string[];
  platforms: string[];
  statuses: string[];
};

export function competitorsTag(workspaceId: string) {
  return `library:competitors:${workspaceId}`;
}

export function facetsTag(workspaceId: string) {
  return `library:facets:${workspaceId}`;
}

async function fetchCompetitorsImpl(
  workspaceId: string
): Promise<{ id: string; page_name: string; client_id: string | null }[]> {
  // client_id is included so the LibraryFilters component can
  // resolve the project → brands relationship and offer the
  // "filter by project" dropdown without a second round-trip.
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_competitors")
    .select("id, page_name, client_id")
    .eq("workspace_id", workspaceId)
    .order("page_name");
  return (data ?? []) as {
    id: string;
    page_name: string;
    client_id: string | null;
  }[];
}

async function fetchFacetsImpl(workspaceId: string): Promise<Facets> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_ads_external")
    .select("cta, platforms, status")
    .eq("workspace_id", workspaceId)
    .limit(500);

  const ctas = new Set<string>();
  const platforms = new Set<string>();
  const statuses = new Set<string>();
  for (const r of (data ?? []) as Array<{
    cta: string | null;
    platforms: string[] | null;
    status: string | null;
  }>) {
    if (r.cta) ctas.add(r.cta);
    if (r.status) statuses.add(r.status);
    if (Array.isArray(r.platforms)) r.platforms.forEach((p) => platforms.add(p));
  }

  return {
    ctas: [...ctas].sort(),
    platforms: [...platforms].sort(),
    statuses: [...statuses].sort(),
  };
}

export function getCompetitors(workspaceId: string) {
  return unstable_cache(
    () => fetchCompetitorsImpl(workspaceId),
    ["library", "competitors", workspaceId],
    {
      tags: [competitorsTag(workspaceId)],
      revalidate: 3600, // 1h fallback — invalidation handled by revalidateTag on brand CRUD
    }
  )();
}

export function getFacets(workspaceId: string) {
  return unstable_cache(
    () => fetchFacetsImpl(workspaceId),
    ["library", "facets", workspaceId],
    {
      tags: [facetsTag(workspaceId)],
      revalidate: 600, // 10 min fallback — TTL-based since scans are async/infrequent
    }
  )();
}
