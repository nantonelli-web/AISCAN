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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// `aliases`: extra URL prefixes that should also mark the item active.
// /brands rewrites to /competitors via next.config.ts, so both forms
// can appear in pathname depending on how the user navigated.
const itemDefs = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, aliases: [] as string[] },
  { href: "/brands", key: "brands", icon: Users, aliases: ["/competitors"] },
  { href: "/brands/compare", key: "compare", icon: GitCompareArrows, aliases: ["/competitors/compare"] },
  { href: "/library", key: "library", icon: Library, aliases: [] as string[] },
  { href: "/collections", key: "collections", icon: FolderHeart, aliases: [] as string[] },
  { href: "/benchmarks", key: "benchmarks", icon: Target, aliases: [] as string[] },
  { href: "/report", key: "report", icon: FileText, aliases: [] as string[] },
  // { href: "/alerts", key: "alerts", icon: Bell }, // hidden — info already visible in brand scan history
  { href: "/credits", key: "credits", icon: Coins, aliases: [] as string[] },
  { href: "/settings", key: "settings", icon: Settings, aliases: [] as string[] },
] as const;

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
  // Hide /credits + balance badge entirely for workspaces that pay
  // platform-fee separately and bring their own provider keys.
  const visibleItems = itemDefs.filter(
    (it) => it.key !== "credits" || billingMode !== "subscription",
  );

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-border bg-card sticky top-0 h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AISCAN" className="h-[58px]" />
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map(({ href, key, icon: Icon, aliases }) => {
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-gold/10 text-gold border border-gold/30"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t("sidebar", key)}
            </Link>
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
