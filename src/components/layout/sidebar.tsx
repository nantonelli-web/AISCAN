"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Library,
  BarChart3,
  Target,
  Bell,
  Settings,
  GitCompareArrows,
  FolderHeart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

const itemDefs = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/competitors", key: "competitors", icon: Users },
  { href: "/competitors/compare", key: "compare", icon: GitCompareArrows },
  { href: "/library", key: "library", icon: Library },
  { href: "/collections", key: "collections", icon: FolderHeart },
  { href: "/benchmarks", key: "benchmarks", icon: Target },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-border bg-card">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="size-7 rounded-md bg-gold/15 border border-gold/30 grid place-items-center text-gold text-xs font-bold">
            M
          </span>
          <span className="font-serif text-lg tracking-tight">
            MAIT
          </span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {itemDefs.map(({ href, key, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
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
      <div className="p-4 border-t border-border text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("sidebar", "footer")}
      </div>
    </aside>
  );
}
