import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditPack } from "@/config/pricing";

/**
 * Stripe webhook handler.
 * Handles credit-pack purchases (mode: "payment", current model) AND
 * legacy subscription lifecycle events (mode: "subscription") so any
 * accounts still on a recurring plan keep working until they migrate.
 * Activates when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
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
        // Legacy path: subscription just started — add initial
        // credits. Kept so accounts that were on a recurring plan
        // before the pack migration still get topped up correctly.
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
      } else if (session.mode === "payment") {
        // Credit-pack purchase. The checkout-pack route stamps
        // packId + ownerId in metadata; we re-resolve the pack
        // server-side instead of trusting `metadata.credits`
        // because the metadata is signed by Stripe but the
        // amount-of-truth lives in src/config/pricing.ts (env
        // vars hold the price id mapping). This way a forged
        // metadata payload can not over-credit the user.
        const packId = session.metadata?.packId;
        const ownerId = session.metadata?.ownerId ?? userId;
        if (!packId) {
          console.error(
            "[stripe webhook] payment session missing packId metadata",
            session.id,
          );
          break;
        }

        try {
          const pack = getCreditPack(packId);
          await admin.rpc("mait_add_credits", {
            p_user_id: ownerId,
            p_amount: pack.credits,
            p_reason: `Pack ${pack.name} (+${pack.credits} credits)`,
          });
        } catch (e) {
          console.error(
            `[stripe webhook] unknown packId "${packId}" — credits NOT added:`,
            e,
          );
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
