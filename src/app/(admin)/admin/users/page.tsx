import { createAdminClient } from "@/lib/supabase/admin";
import { UserManagement } from "./user-management";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  const { data: users } = await admin
    .from("mait_users")
    .select(
      "id, name, email, role, workspace_id, credits_balance, created_at"
    )
    .order("created_at", { ascending: false });

  // Fetch workspace names to display alongside users
  const wsIds = [
    ...new Set(
      (users ?? [])
        .map((u) => u.workspace_id)
        .filter(Boolean) as string[]
    ),
  ];

  let workspaceMap: Record<string, string> = {};

  if (wsIds.length > 0) {
    const { data: workspaces } = await admin
      .from("mait_workspaces")
      .select("id, name")
      .in("id", wsIds);

    workspaceMap = Object.fromEntries(
      (workspaces ?? []).map((w) => [w.id, w.name])
    );
  }

  // Disabled state (migration 0061). Separate, error-tolerant query that
  // only pulls disabled rows — so the page still renders if the column
  // isn't applied yet (query errors → empty set → everyone shown active).
  const disabledIds = new Set<string>();
  const { data: flags } = await admin
    .from("mait_users")
    .select("id, disabled_at")
    .not("disabled_at", "is", null);
  for (const f of (flags ?? []) as { id: string; disabled_at: string | null }[]) {
    if (f.disabled_at) disabledIds.add(f.id);
  }

  const enrichedUsers = (users ?? []).map((u) => ({
    ...u,
    workspace_name: u.workspace_id
      ? workspaceMap[u.workspace_id] ?? "—"
      : "—",
    disabled: disabledIds.has(u.id),
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all AISCAN users
        </p>
      </div>

      <UserManagement users={enrichedUsers} />
    </div>
  );
}
