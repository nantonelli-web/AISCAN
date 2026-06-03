import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  label: z.string().max(160).nullable().optional(),
  is_active: z.boolean().optional(),
  max_places: z.number().int().min(1).max(100).optional(),
  max_reviews_per_place: z.number().int().min(0).max(50).optional(),
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
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.is_active !== undefined)
    update.is_active = parsed.data.is_active;
  if (parsed.data.max_places !== undefined)
    update.max_places = parsed.data.max_places;
  if (parsed.data.max_reviews_per_place !== undefined)
    update.max_reviews_per_place = parsed.data.max_reviews_per_place;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("mait_maps_searches")
    .update(update)
    .eq("id", id);

  if (error) {
    logger.error(
      "update search failed",
      {
        channel: "maps/searches",
        event: "searches.update_failed",
        userId: user.id,
        searchId: id,
      },
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("mait_maps_searches")
    .delete()
    .eq("id", id);

  if (error) {
    logger.error(
      "delete search failed",
      {
        channel: "maps/searches",
        event: "searches.delete_failed",
        userId: user.id,
        searchId: id,
      },
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
