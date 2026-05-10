import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  credits_cost: z.number().int().min(0).max(1000).optional(),
  display_name: z.string().min(1).max(120).optional(),
  /** Mark reviewed_at without activating (the "Ignora" action). */
  reviewed: z.boolean().optional(),
});

/**
 * PATCH /api/admin/models/[modelId]
 * Update display_name / credits_cost / is_active. Admin-only via
 * JWT cookie. Toggle attivo/inattivo timbra reviewed_at, cosi un
 * modello rilevato dal sync esce dalla coda "Da revisionare".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await verifyAdminToken(token);
  if (!admin) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { modelId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof parsed.data.is_active === "boolean") {
    updateData.is_active = parsed.data.is_active;
    updateData.reviewed_at = new Date().toISOString();
  }
  if (typeof parsed.data.credits_cost === "number") {
    updateData.credits_cost = parsed.data.credits_cost;
  }
  if (typeof parsed.data.display_name === "string") {
    updateData.display_name = parsed.data.display_name;
  }
  if (parsed.data.reviewed === true) {
    updateData.reviewed_at = new Date().toISOString();
  } else if (parsed.data.reviewed === false) {
    updateData.reviewed_at = null;
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mait_ai_models")
    .update(updateData)
    .eq("id", modelId)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ model: data });
}
