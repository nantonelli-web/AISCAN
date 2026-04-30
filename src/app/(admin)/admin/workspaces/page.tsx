import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspacesTable } from "./workspaces-table";

export const dynamic = "force-dynamic";

export default async function AdminWorkspacesPage() {
  const admin = createAdminClient();

  // Pull workspaces + a per-row aggregate so the admin sees who's
  // who at a glance: member count, current billing mode, whether
  // there are BYO keys configured (to spot the "set to subscription
  // but no key uploaded yet" state).
  const [{ data: workspaces }, { data: members }, { data: keys }] =
    await Promise.all([
      admin
        .from("mait_workspaces")
        .select("id, name, slug, billing_mode, created_at")
        .order("created_at", { ascending: false }),
      admin.from("mait_users").select("workspace_id"),
      admin
        .from("mait_provider_keys")
        .select("workspace_id, provider, status"),
    ]);

  const memberCount: Record<string, number> = {};
  for (const m of members ?? []) {
    if (!m.workspace_id) continue;
    memberCount[m.workspace_id] = (memberCount[m.workspace_id] ?? 0) + 1;
  }

  const keyMap: Record<string, { apify: boolean; openrouter: boolean }> = {};
  for (const k of keys ?? []) {
    if (!k.workspace_id) continue;
    if (!keyMap[k.workspace_id]) keyMap[k.workspace_id] = { apify: false, openrouter: false };
    if (k.provider === "apify" && k.status === "active") {
      keyMap[k.workspace_id].apify = true;
    }
    if (k.provider === "openrouter" && k.status === "active") {
      keyMap[k.workspace_id].openrouter = true;
    }
  }

  const enriched = (workspaces ?? []).map((w) => ({
    ...w,
    billing_mode: (w.billing_mode as "credits" | "subscription") ?? "credits",
    members: memberCount[w.id] ?? 0,
    has_apify_key: keyMap[w.id]?.apify ?? false,
    has_openrouter_key: keyMap[w.id]?.openrouter ?? false,
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Workspaces</h1>
        <p className="text-sm text-muted-foreground">
          Toggle billing mode per workspace. Subscription mode disables credit
          consumption — the workspace pays the platform fee separately and
          uses its own Apify / OpenRouter keys.
        </p>
      </div>

      <WorkspacesTable workspaces={enriched} />
    </div>
  );
}
