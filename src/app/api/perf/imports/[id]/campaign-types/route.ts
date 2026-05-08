import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";

/**
 * PATCH /api/perf/imports/[id]/campaign-types
 * Body: { overrides: Record<campaign_name, type_code> }
 *
 * Persiste gli override manuali fatti dall'utente sulla
 * decodifica automatica dei nomi campagna. Salvati in
 * mait_perf_imports.campaign_type_overrides JSONB.
 */
const schema = z.object({
  overrides: z.record(z.string(), z.string()),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: imp } = await admin
    .from("mait_perf_imports")
    .select("workspace_id")
    .eq("id", id)
    .single();
  if (!imp || imp.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { error } = await admin
    .from("mait_perf_imports")
    .update({ campaign_type_overrides: parsed.data.overrides })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
