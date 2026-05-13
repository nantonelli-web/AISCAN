"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { revokeConnection } from "./actions";

interface Connection {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  access_token_expires_at: string;
  last_used_at: string | null;
  created_at: string;
}

export function ConnectionsList({
  connections,
}: {
  connections: Connection[];
}) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Nessuna connessione attiva. Quando un client MCP completa il flow di
        autorizzazione, appare qui.
      </p>
    );
  }

  function revoke(c: Connection) {
    if (
      !window.confirm(
        `Revocare la connessione di "${c.client_name}"? Il client perdera' immediatamente l'accesso e dovra' ri-autorizzare.`,
      )
    ) {
      return;
    }
    setPendingId(c.id);
    startTransition(async () => {
      try {
        await revokeConnection(c.id);
        toast.success(`Connessione "${c.client_name}" revocata`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      {connections.map((c) => {
        const expired = new Date(c.access_token_expires_at).getTime() < Date.now();
        return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5 flex-wrap"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                {c.client_name}
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">
                  {c.client_id}
                </span>
                {expired && (
                  <span className="text-[10.5px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                    expired
                  </span>
                )}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                Scope: {c.scopes.join(", ")} · Autorizzato{" "}
                {new Date(c.created_at).toLocaleString()}
                {c.last_used_at &&
                  ` · Ultimo uso ${new Date(c.last_used_at).toLocaleString()}`}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => revoke(c)}
              disabled={pending && pendingId === c.id}
              className="gap-1.5 border-red-500/40 text-red-600 hover:bg-red-500/10"
            >
              {pending && pendingId === c.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              Revoca
            </Button>
          </div>
        );
      })}
    </div>
  );
}
