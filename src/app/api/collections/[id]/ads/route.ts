import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const addSchema = z.object({
  ad_id: z.string().uuid(),
});

/** Add an ad to a collection */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "ad_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("mait_collection_ads")
    .upsert(
      { collection_id: id, ad_id: parsed.data.ad_id },
      { onConflict: "collection_id,ad_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove an ad from a collection */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const adId = url.searchParams.get("ad_id");
  if (!adId) return NextResponse.json({ error: "ad_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("mait_collection_ads")
    .delete()
    .eq("collection_id", id)
    .eq("ad_id", adId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
