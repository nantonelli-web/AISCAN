"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CollapsibleClientSection({
  clientName,
  brandCount,
  children,
}: {
  clientKey: string;
  clientName: string;
  clientColor: string;
  brandCount: number;
  children: React.ReactNode;
}) {
  // Default chiuso a ogni ingresso. Niente persistenza in localStorage:
  // l'utente ha chiesto esplicitamente che TUTTI i progetti siano
  // collassati appena entra in /brands. Il toggle apre/chiude solo
  // dentro la sessione corrente; il refresh resetta tutto a chiuso.
  const [collapsed, setCollapsed] = useState(true);

  function toggle() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div>
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
          strokeWidth={2.4}
        />
        <h2 className="text-base font-semibold tracking-tight">{clientName}</h2>
        <Badge variant="muted" className="ml-1">{brandCount}</Badge>
        <div className="flex-1 h-px bg-border ml-3" />
      </button>
      {!collapsed && children}
    </div>
  );
}
