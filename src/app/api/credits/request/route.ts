import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditPack } from "@/config/pricing";
import { sendCreditRechargeRequest } from "@/lib/email/resend";

/**
 * AICREA-style credit recharge request.
 *
 * The user picks a pack on /credits and POSTs here with the credits
 * count. We re-resolve the pack server-side from `pricing.ts` (NEVER
 * trust the client price), persist the request on `mait_credit_requests`
 * with status="pending", and email the AISCAN admin via Resend.
 *
 * No money moves online — the admin pays-in offline, then fulfils
 * the request from the admin panel which calls
 * /api/admin/credits/requests with action="fulfill" to grant the
 * credits via the existing mait_add_credits RPC.
 */
const schema = z.object({
  /** Number of credits in the chosen pack (50/100/250/500/1000).
   *  We look up the canonical price for this number — passing a
   *  `priceEur` from the client would let a forged request pretend
   *  to pay €1 for 1000 credits. */
  credits: z.number().int().positive(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Resolve the pack — throws on unknown credit values, which Zod
  // already filtered to "positive integer", so we add a try/catch
  // for the catalog mismatch case.
  let pack;
  try {
    pack = getCreditPack(parsed.data.credits);
  } catch {
    return NextResponse.json(
      { error: "Pack non valido" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Pull the user profile + workspace name. The email needs both so
  // the admin can identify which workspace asked.
  const { data: profile } = await admin
    .from("mait_users")
    .select("id, email, name, workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: workspace } = await admin
    .from("mait_workspaces")
    .select("name")
    .eq("id", profile.workspace_id)
    .single();

  const userName =
    (profile.name as string | null) ?? user.email ?? "Cliente AISCAN";
  const userEmail = (profile.email as string | null) ?? user.email ?? "";
  const workspaceName = (workspace?.name as string | undefined) ?? "—";

  // Persist the request first — even if the email send fails, the
  // admin can still see and act on it from the panel.
  const { data: insertedRow, error: insertErr } = await admin
    .from("mait_credit_requests")
    .insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      user_email: userEmail,
      user_name: userName,
      credits_requested: pack.credits,
      package_price_eur: pack.priceEur,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !insertedRow) {
    console.error("[/api/credits/request] insert error:", insertErr);
    return NextResponse.json(
      { error: "Server error while saving the request" },
      { status: 500 },
    );
  }

  // Best-effort email — Resend errors are swallowed inside
  // sendCreditRechargeRequest so the API never fails on a transient
  // email outage. The DB row is the source of truth.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  await sendCreditRechargeRequest({
    userName,
    userEmail,
    workspaceName,
    workspaceId: profile.workspace_id,
    credits: pack.credits,
    priceEur: pack.priceEur,
    adminPanelUrl: `${baseUrl}/admin/credits`,
  });

  return NextResponse.json({
    ok: true,
    request_id: insertedRow.id,
  });
}
