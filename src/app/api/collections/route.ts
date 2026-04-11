import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_collections")
    .select("id, name, description, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get ad count per collection
  const collections = await Promise.all(
    (data ?? []).map(async (c) => {
      const { count } = await admin
        .from("mait_collection_ads")
        .select("ad_id", { count: "exact", head: true })
        .eq("collection_id", c.id);
      return { ...c, adCount: count ?? 0 };
    })
  );

  return NextResponse.json(collections);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Nome obbligatorio." }, { status: 400 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_collections")
    .insert({
      workspace_id: profile.workspace_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
