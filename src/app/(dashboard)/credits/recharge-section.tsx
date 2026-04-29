"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { creditPacks, type CreditPack, pricePerCredit } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

/**
 * Recharge module on /credits — sits above the transaction history.
 * AICREA-style flow: clicking a pack does NOT charge anything
 * online; it POSTs to /api/credits/request which emails the admin
 * and stores the request as `pending` on `mait_credit_requests`.
 * The admin then fulfils manually after receiving payment offline,
 * which credits the workspace balance via the existing
 * mait_add_credits RPC.
 *
 * The largest pack is rendered as "best value" (gold ring) to mirror
 * the AICREA UI — the popular badge sits on the largest, not on a
 * mid-tier "recommended".
 */
export function RechargeSection() {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function request(pack: CreditPack) {
    setBusy(pack.credits);
    try {
      const res = await fetch("/api/credits/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credits: pack.credits }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.code === "MISSING_COMPANY") {
          // Hard-redirect to the company form so the user doesn't
          // have to hunt through Settings to find it.
          toast.error(t("company", "missingForCredits"));
          router.push("/settings#company");
          return;
        }
        toast.error(json.error ?? t("credits", "rechargeError"));
        return;
      }
      toast.success(t("credits", "rechargeRequestSent"));
      // Refresh the page so the request lands on the user's history
      // (insert is RLS-visible from the workspace) without a manual reload.
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t("credits", "rechargeTitle")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          {t("credits", "rechargeSubtitle")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {creditPacks.map((pack, idx) => {
          const isLast = idx === creditPacks.length - 1;
          const perCredit = pricePerCredit(pack);
          return (
            <Card
              key={pack.credits}
              className={cn(
                "relative flex flex-col transition-colors",
                isLast
                  ? "border-gold/60 ring-1 ring-gold/30"
                  : "hover:border-gold/40",
              )}
            >
              {pack.savingsPercent > 0 && (
                <Badge
                  variant={isLast ? "gold" : "muted"}
                  className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px]"
                >
                  {isLast ? t("credits", "bestValue") : `−${pack.savingsPercent}%`}
                </Badge>
              )}
              <CardContent className="p-5 flex flex-col gap-3 flex-1 items-center text-center">
                <div className="flex items-baseline gap-1.5">
                  <Coins className="size-5 text-gold self-center" />
                  <span className="text-2xl font-serif text-foreground">
                    {pack.credits.toLocaleString("it-IT")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {t("credits", "creditsUnit")}
                </p>

                <div className="space-y-0.5 mt-1">
                  <p className="text-2xl font-serif text-gold">
                    €{pack.priceEur}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    €{perCredit.toFixed(2)} {t("credits", "perCredit")}
                  </p>
                </div>

                <Button
                  onClick={() => request(pack)}
                  disabled={busy !== null}
                  variant={isLast ? "default" : "outline"}
                  size="sm"
                  className="w-full mt-auto cursor-pointer"
                >
                  {busy === pack.credits ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("credits", "sendingRequest")}
                    </>
                  ) : (
                    t("credits", "requestButton")
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/80 max-w-2xl">
        {t("credits", "rechargeOfflineHint")}
      </p>
    </section>
  );
}
