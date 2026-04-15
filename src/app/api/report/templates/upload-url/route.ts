import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  filename: z.string().min(1),
  client_id: z.string().uuid(),
});

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
  const storagePath = `${parsed.data.client_id}/${Date.now()}_${parsed.data.filename}`;

  const { data, error } = await admin.storage
    .from("templates")
    .createSignedUploadUrl(storagePath);

  if (error) {
    console.error("[templates/upload-url] Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
