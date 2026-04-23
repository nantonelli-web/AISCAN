import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toIsoCountry, coerceCountryForStorage } from "@/lib/meta/country-codes";

/**
 * One-shot backfill: walk mait_competitors for the authenticated workspace
 * and rewrite any country value that is not already a clean ISO alpha-2
 * into its canonical form. Returns a per-row diff so the UI can confirm
 * what changed without triggering surprises.
 *
 * POST for safety (no side effects on GET); idempotent — re-running after a
 * successful pass is a no-op because every row already matches alpha-2.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("mait_competitors")
    .select("id, page_name, country")
    .eq("workspace_id", profile.workspace_id);
  if (error) {
    console.error("[normalize-countries] fetch", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  type Change = {
    id: string;
    page_name: string;
    before: string | null;
    after: string | null;
    resolved: boolean;
  };
  const updated: Change[] = [];
  const skipped: Change[] = [];
  const unchanged: number = rows?.filter((r) => {
    const before = r.country as string | null;
    if (before == null) return true;
    const trimmed = before.trim();
    return /^[A-Z]{2}$/.test(trimmed);
  }).length ?? 0;

  for (const r of rows ?? []) {
    const before = (r.country as string | null) ?? null;
    if (before == null) continue;
    const trimmed = before.trim();
    if (/^[A-Z]{2}$/.test(trimmed)) continue;

    const normalised = toIsoCountry(trimmed);
    const after = coerceCountryForStorage(trimmed);
    // If normalisation fell back to the raw value (toIsoCountry returned
    // null) we skip the write — no point overwriting "Italy" with "Italy".
    if (!normalised) {
      skipped.push({
        id: r.id,
        page_name: r.page_name,
        before,
        after: null,
        resolved: false,
      });
      continue;
    }

    if (!dryRun) {
      const { error: upErr } = await admin
        .from("mait_competitors")
        .update({ country: normalised })
        .eq("id", r.id)
        .eq("workspace_id", profile.workspace_id);
      if (upErr) {
        console.error("[normalize-countries] update", upErr);
        skipped.push({
          id: r.id,
          page_name: r.page_name,
          before,
          after: normalised,
          resolved: false,
        });
        continue;
      }
    }
    updated.push({
      id: r.id,
      page_name: r.page_name,
      before,
      after,
      resolved: true,
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    updated,
    skipped,
    stats: {
      total: rows?.length ?? 0,
      alreadyClean: unchanged,
      normalised: updated.length,
      unresolved: skipped.length,
    },
  });
}
