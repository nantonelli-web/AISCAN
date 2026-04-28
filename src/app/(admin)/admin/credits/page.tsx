import { createAdminClient } from "@/lib/supabase/admin";
import { CreditManager } from "./credit-manager";
import { CreditRequests } from "./credit-requests";

export const dynamic = "force-dynamic";

export default async function AdminCreditsPage() {
  const admin = createAdminClient();

  const [{ data: history }, { data: users }, { data: requests }] =
    await Promise.all([
      admin
        .from("mait_credits_history")
        .select("id, user_id, amount, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("mait_users")
        .select("id, name, email")
        .order("name", { ascending: true }),
      // Pending recharge requests first; fulfilled/rejected last 30
      // for a quick audit trail. Service role bypasses RLS so the
      // admin sees everything across workspaces.
      admin
        .from("mait_credit_requests")
        .select(
          "id, workspace_id, user_id, user_email, user_name, credits_requested, package_price_eur, status, fulfilled_at, notes, created_at",
        )
        .order("status", { ascending: true }) // pending < fulfilled < rejected alphabetically
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

  // Build user lookup for history display
  const userMap: Record<string, { name: string; email: string }> =
    Object.fromEntries(
      (users ?? []).map((u) => [
        u.id,
        { name: u.name ?? "—", email: u.email },
      ])
    );

  const enrichedHistory = (history ?? []).map((h) => ({
    ...h,
    user_name: userMap[h.user_id]?.name ?? "—",
    user_email: userMap[h.user_id]?.email ?? "—",
  }));

  const userOptions = (users ?? []).map((u) => ({
    id: u.id,
    label: `${u.name ?? "No name"} (${u.email})`,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          Credit Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Process recharge requests, adjust balances and audit history.
        </p>
      </div>

      {/* Pending recharge requests — top of the page so the admin
          can act on them at a glance. Resolved requests are shown
          beneath the pending ones for traceability. */}
      <CreditRequests requests={(requests ?? []) as never[]} />

      <CreditManager history={enrichedHistory} userOptions={userOptions} />
    </div>
  );
}
