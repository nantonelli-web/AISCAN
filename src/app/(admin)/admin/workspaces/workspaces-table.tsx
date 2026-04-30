"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  billing_mode: "credits" | "subscription";
  created_at: string;
  members: number;
  has_apify_key: boolean;
  has_openrouter_key: boolean;
}

export function WorkspacesTable({
  workspaces: initial,
}: {
  workspaces: Workspace[];
}) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggle(id: string, current: "credits" | "subscription") {
    const next = current === "credits" ? "subscription" : "credits";
    setPendingId(id);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: id, billing_mode: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update billing mode");
        return;
      }
      setList((prev) =>
        prev.map((w) => (w.id === id ? { ...w, billing_mode: next } : w)),
      );
      toast.success(
        `${list.find((w) => w.id === id)?.name ?? "Workspace"} → ${next}`,
      );
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_140px_180px_120px] gap-4 px-4 py-2 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div>Workspace</div>
        <div>Members</div>
        <div>BYO keys</div>
        <div>Billing mode</div>
        <div>Action</div>
      </div>
      {list.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No workspaces yet.
        </div>
      ) : (
        list.map((w) => {
          const isSubscription = w.billing_mode === "subscription";
          const keysOk = w.has_apify_key && w.has_openrouter_key;
          const subscriptionWithoutKeys = isSubscription && !keysOk;
          return (
            <div
              key={w.id}
              className="grid grid-cols-[1fr_120px_140px_180px_120px] gap-4 px-4 py-3 border-b border-border last:border-b-0 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{w.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {w.slug}
                </p>
              </div>
              <div className="text-sm">{w.members}</div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={w.has_apify_key ? "gold" : "muted"}>
                  Apify {w.has_apify_key ? "✓" : "—"}
                </Badge>
                <Badge variant={w.has_openrouter_key ? "gold" : "muted"}>
                  LLM {w.has_openrouter_key ? "✓" : "—"}
                </Badge>
              </div>
              <div className="space-y-0.5">
                <Badge variant={isSubscription ? "gold" : "muted"}>
                  {isSubscription ? "Subscription" : "Credits"}
                </Badge>
                {subscriptionWithoutKeys && (
                  <p className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    Missing BYO key — scans will fail
                  </p>
                )}
                {!isSubscription && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    AISCAN-managed
                  </p>
                )}
              </div>
              <div>
                <Button
                  size="sm"
                  variant={isSubscription ? "outline" : "default"}
                  onClick={() => toggle(w.id, w.billing_mode)}
                  disabled={pendingId === w.id}
                >
                  {pendingId === w.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isSubscription ? (
                    "→ Credits"
                  ) : (
                    "→ Subscription"
                  )}
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
