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

  // Disabled state lives in Supabase Auth (banned_until), not in mait_users —
  // pull it once and map by id. Paginate defensively in case the user base
  // grows past a single page.
  const disabledIds = new Set<string>();
  const now = Date.now();
  for (let page = 1; page <= 20; page++) {
    const { data: authPage, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !authPage?.users?.length) break;
    for (const au of authPage.users) {
      const bannedUntil = (au as { banned_until?: string | null }).banned_until;
      if (bannedUntil && new Date(bannedUntil).getTime() > now) {
        disabledIds.add(au.id);
      }
    }
    if (authPage.users.length < 1000) break;
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
