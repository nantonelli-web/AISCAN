import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { PERF_SECTIONS } from "@/lib/ai/perf-analysis";
import { getLocale } from "@/lib/i18n/server";

const patchSchema = z.object({
  content: z.string().min(1).max(20_000),
});

/**
 * PATCH /api/perf/imports/[id]/analysis/[section]
 * Update del testo di una specifica sezione (edit utente).
 * Setta edited_by_user=true cosi una rigenerazione "soft" non
 * lo sovrascrive.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; section: string }> },
) {
  const { id, section } = await params;
  if (!(PERF_SECTIONS as readonly string[]).includes(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
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

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Verifica ownership tramite workspace
  const { data: imp } = await admin
    .from("mait_perf_imports")
    .select("workspace_id")
    .eq("id", id)
    .single();
  if (!imp || imp.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const locale = ((await getLocale()) as "it" | "en") ?? "it";
  const { error } = await admin
    .from("mait_perf_analyses")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        import_id: id,
        section,
        content: parsed.data.content,
        model_tier: "manual", // sentinella per row creata/aggiornata da edit pure
        locale,
        edited_by_user: true,
        created_by: user.id,
        updated_at: now,
      },
      { onConflict: "import_id,section,locale" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/perf/imports/[id]/analysis/[section]
 * Rimuove l'analisi di una sezione (per "discard edit" o reset).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; section: string }> },
) {
  const { id, section } = await params;
  if (!(PERF_SECTIONS as readonly string[]).includes(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
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
  const locale = ((await getLocale()) as "it" | "en") ?? "it";
  // Tenant isolation: scope by workspace_id so a caller can't delete
  // another workspace's saved analysis (the PATCH above already checks
  // import ownership; the DELETE must too).
  const { error } = await admin
    .from("mait_perf_analyses")
    .delete()
    .eq("workspace_id", profile.workspace_id)
    .eq("import_id", id)
    .eq("section", section)
    .eq("locale", locale);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
