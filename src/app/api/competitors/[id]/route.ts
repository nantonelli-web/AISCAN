import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  // Monitor config fields
  frequency: z.enum(["manual", "daily", "weekly"]).optional(),
  max_items: z.number().int().min(10).max(1000).optional(),
  // Editable competitor fields
  page_name: z.string().min(1).max(160).optional(),
  page_url: z.string().url().optional(),
  country: z.string().max(200).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { frequency, max_items, page_name, page_url, country, category, client_id } =
    parsed.data;

  // Separate monitor_config fields from direct fields
  const directUpdate: Record<string, unknown> = {};
  if (page_name !== undefined) directUpdate.page_name = page_name;
  if (page_url !== undefined) directUpdate.page_url = page_url;
  if (country !== undefined) directUpdate.country = country;
  if (category !== undefined) directUpdate.category = category;
  if (client_id !== undefined) directUpdate.client_id = client_id;

  // Handle monitor_config merge if frequency or max_items changed
  if (frequency !== undefined || max_items !== undefined) {
    const { data: current } = await supabase
      .from("mait_competitors")
      .select("monitor_config")
      .eq("id", id)
      .single();

    directUpdate.monitor_config = {
      ...(current?.monitor_config ?? {}),
      ...(frequency !== undefined ? { frequency } : {}),
      ...(max_items !== undefined ? { max_items } : {}),
    };
  }

  if (Object.keys(directUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("mait_competitors")
    .update(directUpdate)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("mait_competitors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
