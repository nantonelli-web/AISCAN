import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";

/** GET /api/perf/imports/[id] — single import + diagnostics. */
export async function GET(
  _req: Request,
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
  const { data, error } = await supabase
    .from("mait_perf_imports")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

/** DELETE /api/perf/imports/[id] — drop import + cascade rows + storage file. */
export async function DELETE(
  _req: Request,
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

  const admin = createAdminClient();
  const { data: imp } = await admin
    .from("mait_perf_imports")
    .select("file_path, workspace_id")
    .eq("id", id)
    .single();
  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (imp.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cascade DELETE on import_id will remove rows automatically.
  const { error: delErr } = await admin
    .from("mait_perf_imports")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Best-effort delete file from storage; not fatal on failure.
  if (imp.file_path) {
    await admin.storage
      .from("performance-imports")
      .remove([imp.file_path])
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
