"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Coins, Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { creditPacks, type CreditPack } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

/**
 * Recharge module — sits above the transaction history on
 * /credits. Renders one card per pack from `creditPacks`.
 *
 * The "Pro" pack is flagged `popular` and gets a gold ring + label.
 * Clicking a pack POSTs to /api/stripe/checkout-pack and redirects
 * to the Stripe-hosted Checkout. After Stripe sends the user back to
 * `/credits?recharge=ok`, the success toast fires and the URL is
 * cleaned up so a refresh does not retrigger the toast.
 */
export function RechargeSection() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busyPack, setBusyPack] = useState<string | null>(null);

  // Acknowledge the Stripe redirect once. We can't read the actual
  // session amount client-side without a server round-trip, so the
  // toast just confirms intent — the credit balance card above
  // updates on the next render after the webhook lands.
  useEffect(() => {
    const recharge = searchParams.get("recharge");
    if (recharge === "ok") {
      toast.success(t("credits", "rechargeSuccess"));
      router.replace("/credits");
    } else if (recharge === "cancel") {
      toast.info(t("credits", "rechargeCancelled"));
      router.replace("/credits");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function buy(pack: CreditPack) {
    setBusyPack(pack.id);
    try {
      const res = await fetch("/api/stripe/checkout-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack_id: pack.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        toast.error(json.error ?? t("credits", "rechargeError"));
        return;
      }
      window.location.href = json.url as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyPack(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t("credits", "rechargeTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            {t("credits", "rechargeSubtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {creditPacks.map((pack) => (
          <Card
            key={pack.id}
            className={cn(
              "relative flex flex-col transition-colors",
              pack.popular
                ? "border-gold/60 ring-1 ring-gold/30"
                : "hover:border-gold/40",
            )}
          >
            {pack.popular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider bg-gold text-black px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                <Sparkles className="size-3" />
                {t("credits", "popularBadge")}
              </span>
            )}
            <CardContent className="p-5 flex flex-col gap-3 flex-1">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {pack.name}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <Coins className="size-5 text-gold" />
                  <span className="text-2xl font-serif text-foreground">
                    {pack.credits}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("credits", "creditsUnit")}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5">
                <p className="text-3xl font-serif text-gold">
                  ${pack.priceUsd}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {pack.tagline}
                </p>
              </div>

              <Button
                onClick={() => buy(pack)}
                disabled={busyPack !== null}
                variant={pack.popular ? "default" : "outline"}
                className="mt-auto gap-2 cursor-pointer"
              >
                {busyPack === pack.id ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("credits", "redirecting")}
                  </>
                ) : (
                  <>
                    <Coins className="size-4" />
                    {t("credits", "buyButton")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
