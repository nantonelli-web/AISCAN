import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/models
 * Lista tutti i modelli LLM censiti, attivi e non.
 * Admin-only via JWT cookie.
 */
export async function GET() {
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await verifyAdminToken(token);
  if (!admin) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mait_ai_models")
    .select("*")
    .order("provider", { ascending: true })
    .order("credits_cost", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ models: data ?? [] });
}
