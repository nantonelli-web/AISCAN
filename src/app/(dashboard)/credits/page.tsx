import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, serverT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, CreditCard, CalendarClock, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Fetch user credit data
  const { data: userData } = await supabase
    .from("mait_users")
    .select("credits_balance, subscription_tier, monthly_credits, current_period_end")
    .eq("id", profile.id)
    .single();

  const balance = userData?.credits_balance ?? 0;
  const tier = (userData?.subscription_tier as string) ?? "scout";
  const monthlyCredits = userData?.monthly_credits ?? 10;
  const periodEnd = userData?.current_period_end;

  // Fetch credit history
  const { data: history } = await supabase
    .from("mait_credits_history")
    .select("id, amount, reason, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Calculate total spent
  const totalSpent = (history ?? [])
    .filter((h) => h.amount < 0)
    .reduce((sum, h) => sum + Math.abs(h.amount), 0);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(
      locale === "it" ? "it-IT" : "en-GB",
      { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("credits", "title")}</h1>
        <p className="text-sm text-muted-foreground">{t("credits", "subtitle")}</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <Coins className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("credits", "currentBalance")}</p>
                <p className="text-2xl font-serif text-gold">{balance}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
                <CreditCard className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("credits", "currentPlan")}</p>
                <p className="text-2xl font-serif capitalize">{tier}</p>
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
                <p className="text-xs text-muted-foreground">{t("credits", "monthlyAllowance")}</p>
                <p className="text-2xl font-serif">{monthlyCredits}</p>
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
                <p className="text-xs text-muted-foreground">{t("credits", "renewal")}</p>
                <p className="text-lg font-serif">
                  {periodEnd
                    ? new Date(periodEnd).toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "short" })
                    : t("credits", "notSet")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("credits", "history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("credits", "noHistory")}</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
                <span>{t("credits", "reason")}</span>
                <span className="text-right w-20">{t("credits", "amount")}</span>
                <span className="text-right w-36">{t("credits", "date")}</span>
              </div>
              {/* Rows */}
              {history.map((h) => (
                <div key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground truncate">{h.reason}</span>
                  <span className={`text-right w-20 font-medium ${h.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                    {h.amount > 0 ? "+" : ""}{h.amount}
                  </span>
                  <span className="text-right w-36 text-xs text-muted-foreground">
                    {formatDate(h.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
