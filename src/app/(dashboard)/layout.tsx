import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getBillingMode } from "@/lib/billing/mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getSessionUser();

  if (!profile.workspace_id) {
    redirect("/login?error=no_workspace");
  }

  // Subscription-mode workspaces don't see Credits link or balance —
  // they pay a flat platform fee and bring their own provider keys.
  const billingMode = await getBillingMode(profile.workspace_id);

  return (
    <div className="flex flex-1 min-h-screen print:block">
      <div className="print:hidden contents">
        <Sidebar
          userName={profile.name || profile.email}
          userEmail={profile.email}
          billingMode={billingMode}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 px-6 md:px-8 pt-2 pb-6 md:pb-8 overflow-auto print:p-0 print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  );
}
