"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Library,
  Target,
  Bell,
  Settings,
  GitCompareArrows,
  FolderHeart,
  FileText,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

const itemDefs = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/brands", key: "brands", icon: Users },
  { href: "/brands/compare", key: "compare", icon: GitCompareArrows },
  { href: "/library", key: "library", icon: Library },
  { href: "/collections", key: "collections", icon: FolderHeart },
  { href: "/benchmarks", key: "benchmarks", icon: Target },
  { href: "/report", key: "report", icon: FileText },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/credits", key: "credits", icon: Coins },
  { href: "/settings", key: "settings", icon: Settings },
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

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-border bg-card">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AISCAN" className="h-10" />
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {itemDefs.map(({ href, key, icon: Icon }) => {
          // Exact match for items that are prefixes of other items
          // (e.g. /brands should not highlight when on /brands/compare)
          const isExactMatch = pathname === href;
          const isChildMatch = pathname.startsWith(`${href}/`);
          const hasChildInMenu = itemDefs.some(
            (other) => other.href !== href && other.href.startsWith(`${href}/`)
          );
          const active = isExactMatch || (isChildMatch && !hasChildInMenu);
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
      <div className="border-t border-border pt-3">
        <CreditBadge />
        <div className="px-4 pb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("sidebar", "footer")}
        </div>
      </div>
    </aside>
  );
}
