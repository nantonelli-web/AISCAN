import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin-only billing-mode toggle.
 *
 * PATCH /api/admin/workspaces
 *   body: { workspaceId: uuid, billing_mode: "credits" | "subscription" }
 *
 * Flips the workspace into the chosen mode. Crediti residui restano
 * dormienti per scelta esplicita (Q2.a) — riattivabili rimettendo il
 * workspace in credits mode in qualunque momento.
 */

const schema = z.object({
  workspaceId: z.string().uuid(),
  billing_mode: z.enum(["credits", "subscription"]),
});

export async function PATCH(req: Request) {
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await verifyAdminToken(token);
  if (!admin) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mait_workspaces")
    .update({ billing_mode: parsed.data.billing_mode })
    .eq("id", parsed.data.workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
