import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTemplate } from "@/lib/report/parse-template";

/** GET — list templates, optionally filtered by client_id */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");

  let q = admin
    .from("mait_client_templates")
    .select("id, client_id, name, file_type, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  if (clientId) q = q.eq("client_id", clientId);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const postSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  storage_path: z.string().min(1),
});

/**
 * POST — register a template that was already uploaded to Supabase Storage.
 * The client uploads the file directly to storage (to bypass Vercel's 4.5MB body limit),
 * then calls this endpoint with the storage path.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();
  if (
    !profile?.workspace_id ||
    !["super_admin", "admin", "analyst"].includes(profile.role)
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Missing fields: client_id, name, storage_path" },
      { status: 400 }
    );
  }

  const { client_id, name, storage_path } = parsed.data;
  const admin = createAdminClient();

  // Download the file from storage to parse theme config
  let themeConfig;
  try {
    const { data: fileData, error: dlErr } = await admin.storage
      .from("templates")
      .download(storage_path);

    if (dlErr || !fileData) {
      console.error("[templates] Download failed:", dlErr);
      return NextResponse.json(
        { error: "Template file not found in storage" },
        { status: 400 }
      );
    }

    const buffer = await fileData.arrayBuffer();
    themeConfig = await parseTemplate(buffer);
  } catch (err) {
    console.warn("[templates] Parse failed, using defaults:", err);
    const { DEFAULT_THEME } = await import("@/lib/report/parse-template");
    themeConfig = { ...DEFAULT_THEME };
  }

  // Save record
  const { data: record, error: insertErr } = await admin
    .from("mait_client_templates")
    .insert({
      workspace_id: profile.workspace_id,
      client_id,
      name,
      storage_path,
      file_type: "pptx",
      theme_config: themeConfig,
    })
    .select("id, client_id, name, file_type, theme_config, created_at")
    .single();

  if (insertErr) {
    console.error("[templates] Insert failed:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(record);
}
