"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditRequest {
  id: string;
  workspace_id: string;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  credits_requested: number;
  package_price_eur: number;
  status: "pending" | "fulfilled" | "rejected";
  fulfilled_at: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Admin panel for credit recharge requests. Mirrors the AICREA UI:
 * pending requests at the top with Fulfill / Reject buttons, resolved
 * requests beneath as a thin audit trail.
 *
 * The Fulfill button calls /api/admin/credits/requests with
 * action="fulfill", which adds the credits to the workspace owner
 * via the existing mait_add_credits RPC and marks the row fulfilled
 * in a single round trip.
 */
export function CreditRequests({ requests }: { requests: CreditRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>(
    {},
  );

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  async function action(req: CreditRequest, op: "fulfill" | "reject") {
    if (
      op === "reject" &&
      !confirm(
        `Reject ${req.credits_requested} credits request from ${req.user_email}?`,
      )
    ) {
      return;
    }
    setBusy(req.id);
    try {
      const res = await fetch("/api/admin/credits/requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: req.id,
          action: op,
          notes: notesByRequest[req.id] ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Action failed");
        return;
      }
      toast.success(
        op === "fulfill"
          ? `+${req.credits_requested} credits added`
          : "Request rejected",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Inbox className="size-4" />
          Recharge requests
          {pending.length > 0 && (
            <Badge variant="gold" className="text-[10px]">
              {pending.length} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pending */}
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No pending requests.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => {
              const isBusy = busy === req.id;
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {req.user_name ?? "—"}{" "}
                        <span className="text-muted-foreground font-normal">
                          ({req.user_email})
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {fmtDate(req.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-semibold tabular-nums">
                        {req.credits_requested.toLocaleString("it-IT")}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          credits
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        €{Number(req.package_price_eur).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <Input
                    value={notesByRequest[req.id] ?? ""}
                    onChange={(e) =>
                      setNotesByRequest((prev) => ({
                        ...prev,
                        [req.id]: e.target.value,
                      }))
                    }
                    placeholder="Notes (optional, e.g. invoice ref)"
                    className="text-xs h-8"
                  />

                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => action(req, "reject")}
                      disabled={isBusy}
                      className="text-red-400 hover:text-red-400 hover:bg-red-400/10"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => action(req, "fulfill")}
                      disabled={isBusy}
                      className="gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Fulfill +{req.credits_requested}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resolved (collapsed list, just for traceability) */}
        {resolved.length > 0 && (
          <details className="pt-2">
            <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
              Recently resolved ({resolved.length})
            </summary>
            <div className="mt-3 rounded-md border border-border divide-y divide-border text-xs">
              {resolved.map((req) => (
                <div
                  key={req.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 items-center"
                >
                  <div className="min-w-0 truncate">
                    {req.user_email}
                    {req.notes && (
                      <span className="text-muted-foreground ml-1">
                        — {req.notes}
                      </span>
                    )}
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {req.credits_requested}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    €{Number(req.package_price_eur).toFixed(2)}
                  </span>
                  <Badge
                    variant={
                      req.status === "fulfilled" ? "gold" : "muted"
                    }
                    className={cn(
                      "text-[10px]",
                      req.status === "rejected" &&
                        "bg-red-400/15 text-red-300 border-red-400/30",
                    )}
                  >
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
