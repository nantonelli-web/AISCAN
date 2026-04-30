import { createAdminClient } from "@/lib/supabase/admin";

export type BillingMode = "credits" | "subscription";

/**
 * Resolve the billing_mode for a workspace. Defaults to "credits"
 * when the workspace row is missing the column (legacy DBs that
 * predate migration 0032) so existing customers stay on the
 * managed AISCAN env keys until the super_admin opts them in.
 */
export async function getBillingMode(workspaceId: string): Promise<BillingMode> {
  if (!workspaceId) return "credits";
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_workspaces")
    .select("billing_mode")
    .eq("id", workspaceId)
    .maybeSingle();
  const raw = (data?.billing_mode as string | null | undefined) ?? "credits";
  return raw === "subscription" ? "subscription" : "credits";
}
