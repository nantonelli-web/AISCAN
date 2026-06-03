import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const schema = z.object({
  filename: z.string().min(1).max(300),
  client_id: z.string().uuid(),
  channel: z.enum(["meta", "google", "tiktok", "snapchat"]),
});

function sanitizePerfFilename(raw: string): string {
  const base = raw.replace(/^.*[/\\]/, "").trim();
  const extMatch = base.match(/\.(csv|xlsx)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".csv";
  const stem = (extMatch ? base.slice(0, -extMatch[0].length) : base)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  return `${stem || "export"}${ext}`;
}

/**
 * Genera un signed upload URL per il bucket performance-imports.
 * Stesso pattern di /api/report/templates/upload-url.
 *
 * Path scheme: {workspace_id}/{client_id}/{channel}/{ts}_{filename}
 */
export async function POST(req: Request) {
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
  const safeName = sanitizePerfFilename(parsed.data.filename);
  const storagePath = `${profile.workspace_id}/${parsed.data.client_id}/${parsed.data.channel}/${Date.now()}_${safeName}`;

  const { data, error } = await admin.storage
    .from("performance-imports")
    .createSignedUploadUrl(storagePath);

  if (error) {
    logger.error(
      "upload URL generation failed",
      {
        channel: "perf/upload-url",
        event: "upload.signed_url_failed",
        workspaceId: profile.workspace_id,
        userId: user.id,
      },
      error,
    );
    return NextResponse.json(
      { error: "Upload URL generation failed" },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const fullUrl = data.signedUrl.startsWith("http")
    ? data.signedUrl
    : `${baseUrl}/storage/v1${data.signedUrl}`;

  return NextResponse.json({
    signedUrl: fullUrl,
    path: data.path,
    storagePath,
    fileName: safeName,
  });
}
