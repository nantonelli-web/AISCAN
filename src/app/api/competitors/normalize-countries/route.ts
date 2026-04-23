import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coerceCountryForStorage } from "@/lib/meta/country-codes";

// Either a single alpha-2 ("IT") or a canonical CSV of alpha-2s ("IT,DE,GB").
const CANONICAL_SHAPE = /^[A-Z]{2}(,[A-Z]{2})*$/;

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
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "true";
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: profileErr } = await supabase
      .from("mait_users")
      .select("workspace_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("[normalize-countries] profile", profileErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
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
    const before = (r.country as string | null)?.trim() ?? null;
    if (!before) return true;
    return CANONICAL_SHAPE.test(before);
  }).length ?? 0;

  for (const r of rows ?? []) {
    const before = (r.country as string | null) ?? null;
    if (before == null) continue;
    const trimmed = before.trim();
    if (!trimmed) continue;
    // Already in canonical form — no write needed.
    if (CANONICAL_SHAPE.test(trimmed)) continue;

    // coerceCountryForStorage handles both single values ("Italy" -> "IT")
    // and comma-separated lists ("IT, DE, UK, FR, ES" -> "IT,DE,GB,FR,ES").
    // If it cannot produce a canonical shape, we flag the row as unresolved.
    const canonical = coerceCountryForStorage(trimmed) ?? trimmed;
    const isCanonical = CANONICAL_SHAPE.test(canonical);

    if (!isCanonical) {
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
        .update({ country: canonical })
        .eq("id", r.id)
        .eq("workspace_id", profile.workspace_id);
      if (upErr) {
        console.error("[normalize-countries] update", upErr);
        skipped.push({
          id: r.id,
          page_name: r.page_name,
          before,
          after: canonical,
          resolved: false,
        });
        continue;
      }
    }
    updated.push({
      id: r.id,
      page_name: r.page_name,
      before,
      after: canonical,
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
  } catch (e) {
    // This is an admin-gated, workspace-scoped one-shot utility — echoing
    // the real error back to the caller is worth it for debuggability. Not
    // a pattern to copy into user-facing routes.
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack?.split("\n").slice(0, 5).join("\n") : undefined;
    console.error("[normalize-countries] unhandled", e);
    return NextResponse.json(
      { error: "Server error", detail: message, stackHint: stack },
      { status: 500 }
    );
  }
}
