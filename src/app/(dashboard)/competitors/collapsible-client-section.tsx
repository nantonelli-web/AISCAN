"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CollapsibleClientSection({
  clientKey,
  clientName,
  clientColor,
  brandCount,
  children,
}: {
  clientKey: string;
  clientName: string;
  clientColor: string;
  brandCount: number;
  children: React.ReactNode;
}) {
  const storageKey = `brands-collapsed-${clientKey}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") setCollapsed(true);
    } catch {
      // localStorage disabled — fall back to default expanded
    }
  }, [storageKey]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div>
      {/* Section header now reads as a real grouping divider, not a
          tiny clickable line. The client colour gets a visible 3px
          rail so the eye picks up the project membership at a glance.
          Badge count moved to the right edge for breathing room. */}
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-3 mb-4 w-full text-left cursor-pointer group"
      >
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground group-hover:text-foreground transition-all",
            collapsed && "-rotate-90"
          )}
        />
        <div
          className="h-5 w-1 rounded-full shrink-0"
          style={{ backgroundColor: clientColor }}
        />
        <h2 className="text-base font-semibold tracking-tight">{clientName}</h2>
        <Badge variant="muted" className="ml-1">{brandCount}</Badge>
        <div className="flex-1 h-px bg-border ml-3" />
      </button>
      {!collapsed && children}
    </div>
  );
}
