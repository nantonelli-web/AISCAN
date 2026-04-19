import { createAdminClient } from "@/lib/supabase/admin";
import { creditCosts, type CreditAction } from "@/config/pricing";

/**
 * Check if a user has enough credits for an action.
 * Returns { ok, balance, cost }.
 */
export async function checkCredits(
  userId: string,
  action: CreditAction
): Promise<{ ok: boolean; balance: number; cost: number }> {
  const cost = creditCosts[action];
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_users")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  const balance = data?.credits_balance ?? 0;
  return { ok: balance >= cost, balance, cost };
}

/**
 * Consume credits for an action. Uses the atomic PostgreSQL function
 * `mait_consume_credits` which locks the row and checks balance.
 *
 * Returns { ok, balance } — ok=false if insufficient credits.
 */
export async function consumeCredits(
  userId: string,
  action: CreditAction,
  reason: string,
  referenceId?: string
): Promise<{ ok: boolean; balance: number }> {
  const cost = creditCosts[action];
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("mait_consume_credits", {
    p_user_id: userId,
    p_amount: cost,
    p_reason: reason,
    p_reference_id: referenceId ?? null,
  });

  if (error) {
    console.error("[credits] consume error:", error);
    return { ok: false, balance: 0 };
  }

  // data is the boolean returned by the function
  const ok = data === true;

  // Fetch updated balance
  const { data: user } = await admin
    .from("mait_users")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  return { ok, balance: user?.credits_balance ?? 0 };
}

/**
 * Refund credits when an action fails after consumption.
 */
export async function refundCredits(
  userId: string,
  action: CreditAction,
  reason: string
): Promise<void> {
  const cost = creditCosts[action];
  const admin = createAdminClient();

  await admin.rpc("mait_add_credits", {
    p_user_id: userId,
    p_amount: cost,
    p_reason: `Refund: ${reason}`,
  });
}
