import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook handler.
 * Handles subscription lifecycle and credit management.
 * Currently disabled — will activate when STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET are configured.
 */
export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    // ─── Subscription created or updated ─────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) break;

      const priceId = sub.items.data[0]?.price?.id;
      const tier = await resolveTier(admin, priceId);

      const periodStart = (sub as unknown as Record<string, number>).current_period_start;
      const periodEnd = (sub as unknown as Record<string, number>).current_period_end;

      await admin
        .from("mait_users")
        .update({
          subscription_status: sub.status === "active" ? "active" : "past_due",
          stripe_subscription_id: sub.id,
          cancel_at_period_end: sub.cancel_at_period_end,
          ...(periodStart ? { current_period_start: new Date(periodStart * 1000).toISOString() } : {}),
          ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
          ...(tier ? { subscription_tier: tier } : {}),
        })
        .eq("id", userId);
      break;
    }

    // ─── Subscription deleted ────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) break;

      await admin
        .from("mait_users")
        .update({
          subscription_tier: "scout",
          subscription_status: "canceled",
          monthly_credits: 10,
          cancel_at_period_end: false,
        })
        .eq("id", userId);

      await admin.rpc("mait_add_credits", {
        p_user_id: userId,
        p_amount: 0,
        p_reason: "Subscription canceled — downgraded to Scout",
      });
      break;
    }

    // ─── Invoice paid (renewal or initial) ───────────────────
    case "invoice.paid": {
      const invoice = event.data.object;
      const subId = (invoice as unknown as Record<string, unknown>).subscription as string | null;
      if (!subId) break;

      const { data: user } = await admin
        .from("mait_users")
        .select("id, monthly_credits")
        .eq("stripe_subscription_id", subId)
        .single();

      if (user) {
        // Reset credits to monthly allowance
        await admin
          .from("mait_users")
          .update({ credits_balance: user.monthly_credits })
          .eq("id", user.id);

        await admin.rpc("mait_add_credits", {
          p_user_id: user.id,
          p_amount: 0,
          p_reason: "Monthly credit renewal",
        });
      }
      break;
    }

    // ─── Checkout completed ──────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      if (!userId) break;

      if (session.mode === "subscription") {
        // Subscription just started — add initial credits
        const { data: plan } = await admin
          .from("mait_users")
          .select("monthly_credits")
          .eq("id", userId)
          .single();

        if (plan) {
          await admin.rpc("mait_add_credits", {
            p_user_id: userId,
            p_amount: plan.monthly_credits,
            p_reason: "Subscription activated",
          });
        }
      }
      break;
    }

    default:
      // Unhandled event type
      break;
  }

  return NextResponse.json({ received: true });
}

/**
 * Resolve Stripe price ID to subscription tier.
 * Two separate equality queries avoid PostgREST filter-string injection
 * from user-controlled priceId values.
 */
async function resolveTier(
  admin: ReturnType<typeof createAdminClient>,
  priceId?: string
): Promise<string | null> {
  if (!priceId) return null;

  const [monthly, yearly] = await Promise.all([
    admin
      .from("mait_subscription_plans")
      .select("tier")
      .eq("stripe_monthly_price_id", priceId)
      .maybeSingle(),
    admin
      .from("mait_subscription_plans")
      .select("tier")
      .eq("stripe_yearly_price_id", priceId)
      .maybeSingle(),
  ]);

  return monthly.data?.tier ?? yearly.data?.tier ?? null;
}
