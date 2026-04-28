import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale, serverT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, CalendarClock, TrendingUp, Receipt } from "lucide-react";
import { RechargeSection } from "./recharge-section";
import { HistorySection } from "./history-section";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Resolve workspace owner (oldest member) — credits live on the
  // owner row, all team members share the same pool.
  const { data: owner } = await admin
    .from("mait_users")
    .select("id, credits_balance, monthly_credits, current_period_end")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const ownerId = owner?.id ?? profile.id;
  const balance = owner?.credits_balance ?? 0;
  const monthlyCredits = owner?.monthly_credits ?? 10;
  const periodEnd = owner?.current_period_end;

  // Transaction history — client component handles the collapse.
  const { data: history } = await admin
    .from("mait_credits_history")
    .select("id, amount, reason, created_at")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Total spent so far — kept on the page header as a quick "how
  // much have I burned this period" pulse.
  const totalSpent = (history ?? [])
    .filter((h) => h.amount < 0)
    .reduce((sum, h) => sum + Math.abs(h.amount), 0);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          {t("credits", "title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("credits", "subtitle")}
        </p>
      </div>

      {/* Stats — compact grid: Balance, Monthly free allowance,
          Total spent, Renewal date. The legacy "Plan" card is gone
          (no more subscription tiers; everyone is on a pay-as-you-go
          credit balance). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <Coins className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("credits", "currentBalance")}
                </p>
                <p className="text-2xl font-serif text-gold">{balance}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <TrendingUp className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("credits", "monthlyAllowance")}
                </p>
                <p className="text-2xl font-serif">{monthlyCredits}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <Receipt className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("credits", "totalSpent")}
                </p>
                <p className="text-2xl font-serif">{totalSpent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <CalendarClock className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("credits", "renewal")}
                </p>
                <p className="text-lg font-serif">
                  {periodEnd
                    ? new Date(periodEnd).toLocaleDateString(
                        locale === "it" ? "it-IT" : "en-GB",
                        { day: "2-digit", month: "short" },
                      )
                    : t("credits", "notSet")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recharge — credit packs, one-time payment via Stripe Checkout */}
      <RechargeSection />

      {/* Transaction history — collapsible card, closed by default */}
      <HistorySection
        history={(history ?? []) as never[]}
        locale={locale === "it" ? "it" : "en"}
      />
    </div>
  );
}
