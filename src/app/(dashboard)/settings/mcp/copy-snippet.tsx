"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopySnippet({
  label,
  value,
  multiline,
  muted,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  muted?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <div
        className={`flex ${
          multiline ? "items-start" : "items-center"
        } gap-2 rounded-md border border-border ${muted ? "bg-muted/30" : "bg-background"} p-3`}
      >
        {multiline ? (
          <pre className="flex-1 text-[12px] font-mono whitespace-pre-wrap break-all">
            {value}
          </pre>
        ) : (
          <code className="flex-1 text-[12.5px] font-mono break-all">
            {value}
          </code>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copy}
          className="gap-1.5 shrink-0"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiato" : "Copia"}
        </Button>
      </div>
    </div>
  );
}
