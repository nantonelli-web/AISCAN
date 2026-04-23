import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  filename: z.string().min(1).max(200),
  client_id: z.string().uuid(),
});

/** Strip path separators and unusual chars; preserve extension if .ppt/.pptx. */
function sanitizeTemplateFilename(raw: string): string {
  const base = raw.replace(/^.*[/\\]/, "").trim(); // drop any path segment
  const extMatch = base.match(/\.(pptx?|potx|key)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".pptx";
  const stem = (extMatch ? base.slice(0, -extMatch[0].length) : base)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  return `${stem || "template"}${ext}`;
}

/**
 * Generate a signed upload URL for Supabase Storage.
 * The client uploads the file directly to this URL (bypassing Vercel).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const admin = createAdminClient();
  const safeName = sanitizeTemplateFilename(parsed.data.filename);
  const storagePath = `${parsed.data.client_id}/${Date.now()}_${safeName}`;

  const { data, error } = await admin.storage
    .from("templates")
    .createSignedUploadUrl(storagePath);

  if (error) {
    console.error("[templates/upload-url] Failed:", error);
    return NextResponse.json({ error: "Upload URL generation failed" }, { status: 500 });
  }

  // Ensure the signed URL is absolute
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const fullUrl = data.signedUrl.startsWith("http")
    ? data.signedUrl
    : `${baseUrl}/storage/v1${data.signedUrl}`;

  return NextResponse.json({
    signedUrl: fullUrl,
    path: data.path,
    storagePath,
  });
}
