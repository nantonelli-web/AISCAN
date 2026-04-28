import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin: fulfil or reject a credit recharge request.
 *
 * Mirrors the AICREA admin endpoint. Fulfil grants the credits to
 * the workspace owner via the existing `mait_add_credits` RPC and
 * marks the request row fulfilled in a single transaction.
 *
 * Reject just stamps the row as rejected with optional notes — no
 * credit movement.
 */
const schema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["fulfill", "reject"]),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PATCH(req: Request) {
  // Reuse the admin JWT pattern from /api/admin/credits.
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminToken = await verifyAdminToken(token);
  if (!adminToken)
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { requestId, action, notes } = parsed.data;
  const supabase = createAdminClient();

  // Load + sanity-check the request row.
  const { data: request, error: fetchErr } = await supabase
    .from("mait_credit_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "Request already processed" },
      { status: 400 },
    );
  }

  if (action === "fulfill") {
    // Resolve the workspace owner — credits land on the founder
    // regardless of who clicked "Buy" inside the workspace. Same
    // pattern as the consume.ts library.
    const { data: owner } = await supabase
      .from("mait_users")
      .select("id")
      .eq("workspace_id", request.workspace_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const ownerId = owner?.id ?? request.user_id;
    if (!ownerId) {
      return NextResponse.json(
        { error: "Cannot resolve workspace owner" },
        { status: 500 },
      );
    }

    const reason = `[Admin] Pack ${request.credits_requested} crediti (€${Number(
      request.package_price_eur,
    ).toFixed(2)})`;

    const { error: rpcErr } = await supabase.rpc("mait_add_credits", {
      p_user_id: ownerId,
      p_amount: request.credits_requested,
      p_reason: reason,
    });

    if (rpcErr) {
      console.error("[/api/admin/credits/requests] RPC error:", rpcErr);
      return NextResponse.json(
        { error: "Failed to credit balance" },
        { status: 500 },
      );
    }

    await supabase
      .from("mait_credit_requests")
      .update({
        status: "fulfilled",
        fulfilled_by: adminToken.adminId ?? null,
        fulfilled_at: new Date().toISOString(),
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  } else {
    await supabase
      .from("mait_credit_requests")
      .update({
        status: "rejected",
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }

  return NextResponse.json({ ok: true });
}
