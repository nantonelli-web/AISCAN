import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getSessionUser();

  if (!profile.workspace_id) {
    redirect("/login?error=no_workspace");
  }

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("mait_workspaces")
    .select("name")
    .eq("id", profile.workspace_id)
    .single();

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header profile={profile} workspaceName={ws?.name ?? "—"} />
        <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
