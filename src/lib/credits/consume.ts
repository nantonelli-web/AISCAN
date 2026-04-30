import { createAdminClient } from "@/lib/supabase/admin";
import { creditCosts, type CreditAction } from "@/config/pricing";

/**
 * Resolve the workspace owner + workspace_id for the user. The owner
 * is the first (oldest) member of the workspace; their credit balance
 * is the one charged. The workspace_id is also returned so the
 * billing-mode gate can short-circuit subscription-mode workspaces
 * before any RPC call.
 */
async function resolveOwnerAndWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ ownerId: string; workspaceId: string | null }> {
  const { data: user } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", userId)
    .single();

  if (!user?.workspace_id) return { ownerId: userId, workspaceId: null };

  const { data: owner } = await admin
    .from("mait_users")
    .select("id")
    .eq("workspace_id", user.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return {
    ownerId: owner?.id ?? userId,
    workspaceId: user.workspace_id as string,
  };
}

/**
 * True when the workspace is on the BYO/subscription billing mode,
 * which bypasses credit consumption entirely. Defaults to credits
 * mode (charges) when the column or row is missing — safer default
 * for legacy DB states.
 */
async function isSubscriptionMode(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string | null,
): Promise<boolean> {
  if (!workspaceId) return false;
  const { data } = await admin
    .from("mait_workspaces")
    .select("billing_mode")
    .eq("id", workspaceId)
    .maybeSingle();
  return (data?.billing_mode as string | null) === "subscription";
}

/**
 * Check if the workspace has enough credits for an action.
 * Credits are checked on the workspace owner's balance — UNLESS
 * the workspace is in subscription mode, in which case we report
 * `ok=true` unconditionally so route handlers don't gate scans on
 * a balance the user is no longer expected to maintain. Cost is
 * still returned so the UI can label the operation honestly even
 * in sub mode.
 */
export async function checkCredits(
  userId: string,
  action: CreditAction
): Promise<{ ok: boolean; balance: number; cost: number }> {
  const cost = creditCosts[action];
  const admin = createAdminClient();
  const { ownerId, workspaceId } = await resolveOwnerAndWorkspace(admin, userId);

  if (await isSubscriptionMode(admin, workspaceId)) {
    return { ok: true, balance: -1, cost };
  }

  const { data } = await admin
    .from("mait_users")
    .select("credits_balance")
    .eq("id", ownerId)
    .single();

  const balance = data?.credits_balance ?? 0;
  return { ok: balance >= cost, balance, cost };
}

/**
 * Consume credits for an action from the workspace owner's balance.
 * Uses the atomic PostgreSQL function `mait_consume_credits`.
 *
 * Returns { ok, balance } — ok=false if insufficient credits.
 *
 * Subscription-mode workspaces no-op: the user is paying the
 * platform fee separately and provider costs are billed directly
 * to their BYO account. Returns `{ ok: true, balance: -1 }` so
 * existing `if (!credits.ok)` checks treat subscription as
 * "always allowed".
 */
export async function consumeCredits(
  userId: string,
  action: CreditAction,
  reason: string,
  referenceId?: string
): Promise<{ ok: boolean; balance: number }> {
  const cost = creditCosts[action];
  const admin = createAdminClient();
  const { ownerId, workspaceId } = await resolveOwnerAndWorkspace(admin, userId);

  if (await isSubscriptionMode(admin, workspaceId)) {
    return { ok: true, balance: -1 };
  }

  const { data, error } = await admin.rpc("mait_consume_credits", {
    p_user_id: ownerId,
    p_amount: cost,
    p_reason: reason,
    p_reference_id: referenceId ?? null,
  });

  if (error) {
    console.error("[credits] consume error:", error);
    return { ok: false, balance: 0 };
  }

  const ok = data === true;

  // Fetch updated balance
  const { data: user } = await admin
    .from("mait_users")
    .select("credits_balance")
    .eq("id", ownerId)
    .single();

  return { ok, balance: user?.credits_balance ?? 0 };
}

/**
 * Refund credits to the workspace owner when an action fails.
 * Subscription-mode workspaces no-op (nothing to refund — nothing
 * was charged in the first place).
 */
export async function refundCredits(
  userId: string,
  action: CreditAction,
  reason: string
): Promise<void> {
  const cost = creditCosts[action];
  const admin = createAdminClient();
  const { ownerId, workspaceId } = await resolveOwnerAndWorkspace(admin, userId);

  if (await isSubscriptionMode(admin, workspaceId)) return;

  await admin.rpc("mait_add_credits", {
    p_user_id: ownerId,
    p_amount: cost,
    p_reason: `Refund: ${reason}`,
  });
}
