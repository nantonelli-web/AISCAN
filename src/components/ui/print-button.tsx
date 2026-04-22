"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standalone client-side print trigger. Hidden from print output itself
 * via print:hidden so it doesn't appear in the printed document.
 */
export function PrintButton({
  label = "Stampa",
  className,
  variant = "ghost",
}: {
  label?: string;
  className?: string;
  variant?: "ghost" | "outline";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md text-xs transition-colors cursor-pointer print:hidden";
  const styles = {
    ghost:
      "text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1.5",
    outline:
      "border border-border text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5",
  };
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(base, styles[variant], className)}
    >
      <Printer className="size-3.5" />
      {label}
    </button>
  );
}
