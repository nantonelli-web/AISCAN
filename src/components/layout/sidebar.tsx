"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Library,
  Target,
  // Bell,
  Settings,
  GitCompareArrows,
  FolderHeart,
  FileText,
  LogOut,
  Coins,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// Navigation grouped semantically. "Setup" = configure who you watch.
// "Analyze" = look at what they did. "Output" = produce something for
// a stakeholder. "Account" = administrative. The flat 9-item list was
// hard to scan and gave Dashboard/Settings the same visual weight as
// the high-traffic Brands/Library entries.
//
// `aliases`: extra URL prefixes that should also mark the item active.
// /brands rewrites to /competitors via next.config.ts, so both forms
// can appear in pathname depending on how the user navigated.
type NavItem = {
  href: string;
  key: string;
  icon: typeof LayoutDashboard;
  aliases: string[];
};
type NavGroup = { key: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    key: "groupSetup",
    items: [
      { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, aliases: [] },
      { href: "/brands", key: "brands", icon: Users, aliases: ["/competitors"] },
    ],
  },
  {
    key: "groupAnalyze",
    items: [
      // Single "Monitoring" entry that hosts workspace-level tools
      // (SERP + Maps today, future Hashtag / Trends / Reviews). The
      // landing page at /monitoring lists each tool; aliases keep the
      // entry highlighted while the user is inside /serp or /maps so
      // the visual breadcrumb still works.
      { href: "/monitoring", key: "monitoring", icon: Radar, aliases: ["/serp", "/maps"] },
      { href: "/library", key: "library", icon: Library, aliases: [] },
      { href: "/brands/compare", key: "compare", icon: GitCompareArrows, aliases: ["/competitors/compare"] },
      { href: "/benchmarks", key: "benchmarks", icon: Target, aliases: [] },
    ],
  },
  {
    key: "groupBuild",
    items: [
      { href: "/collections", key: "collections", icon: FolderHeart, aliases: [] },
      { href: "/report", key: "report", icon: FileText, aliases: [] },
    ],
  },
  {
    key: "groupAccount",
    items: [
      { href: "/credits", key: "credits", icon: Coins, aliases: [] },
      { href: "/settings", key: "settings", icon: Settings, aliases: [] },
    ],
  },
];

// Flat list rebuilt from groups so the longest-prefix-wins active
// detection keeps working unchanged.
const itemDefs: NavItem[] = navGroups.flatMap((g) => g.items);

function CreditBadge() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/credits/balance")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setBalance(d.balance); })
      .catch(() => {});
  }, []);
  if (balance === null) return null;
  return (
    <div className="mx-3 mb-2 rounded-md bg-gold/10 border border-gold/30 px-3 py-2 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">Crediti</span>
      <span className="text-sm font-semibold text-gold">{balance}</span>
    </div>
  );
}

export function Sidebar({
  userName,
  userEmail,
  billingMode = "credits",
}: {
  userName: string;
  userEmail: string;
  billingMode?: "credits" | "subscription";
}) {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-border bg-card sticky top-0 h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AISCAN" className="h-[58px]" />
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => {
          // Hide /credits entirely for workspaces that pay platform-fee
          // separately and bring their own provider keys. If the
          // filter empties a group we drop the entire group label.
          const items = group.items.filter(
            (it) => it.key !== "credits" || billingMode !== "subscription",
          );
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="space-y-1">
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-semibold">
                {t("sidebar", group.key)}
              </div>
              {items.map(({ href, key, icon: Icon, aliases }) => {
                // Longest-prefix wins — so /competitors/compare activates
                // Compare, not Brands, even though /competitors also matches.
                const prefixes = [href, ...aliases];
                const bestOwnMatch = prefixes
                  .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
                  .reduce((max, p) => (p.length > max ? p.length : max), -1);
                const bestOtherMatch = itemDefs
                  .filter((o) => o.href !== href)
                  .flatMap((o) => [o.href, ...o.aliases])
                  .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
                  .reduce((max, p) => (p.length > max ? p.length : max), -1);
                const active = bestOwnMatch >= 0 && bestOwnMatch >= bestOtherMatch;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        // Active state now uses a left rail + tinted text
                        // so the eye lands on it instantly, instead of a
                        // full-card border-and-tint that competed with
                        // KPI cards on the page.
                        ? "bg-gold-soft text-gold font-medium pl-[14px] before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-gold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active && "text-gold")} />
                    {t("sidebar", key)}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-border pt-3 space-y-2 shrink-0">
        {/* User profile + logout */}
        <div className="mx-3 flex items-center gap-2">
          <div className="size-7 rounded-full bg-gold/15 border border-gold/30 grid place-items-center text-gold text-[10px] font-semibold shrink-0">
            {userName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{userEmail}</p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="size-7 rounded-md border border-border hover:bg-muted grid place-items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <LogOut className="size-3" />
            </button>
          </form>
        </div>
        {billingMode !== "subscription" && <CreditBadge />}
        <div className="px-4 pb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("sidebar", "footer")}
        </div>
      </div>
    </aside>
  );
}
