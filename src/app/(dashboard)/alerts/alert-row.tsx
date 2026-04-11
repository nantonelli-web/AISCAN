"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

interface Alert {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function AlertRow({ alert }: { alert: Alert }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(alert.read);
  const { t } = useT();

  function dismiss() {
    setDismissed(true);
    startTransition(async () => {
      const res = await fetch(`/api/alerts/${alert.id}`, { method: "PATCH" });
      if (!res.ok) {
        toast.error(t("alerts", "markReadError"));
        setDismissed(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className={dismissed ? "opacity-50" : ""}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="gold">{alert.type}</Badge>
            {!dismissed && <Badge variant="muted">new</Badge>}
          </div>
          <p className="text-sm">{alert.message}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {formatDate(alert.created_at)}
          </span>
          {!dismissed && (
            <button
              onClick={dismiss}
              disabled={pending}
              className="size-8 rounded-md border border-border hover:bg-muted hover:border-gold/40 grid place-items-center text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
              aria-label="Mark as read"
              title="Mark as read"
            >
              <Check className="size-4" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
