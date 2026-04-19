import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

const schema = z.object({
  tier: z.enum(["analyst", "strategist", "agency"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

/**
 * Create a Stripe Checkout Session for a subscription upgrade.
 * Currently disabled — Stripe integration is prepared but not active.
 */
export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY to enable payments." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get plan from DB
  const { data: plan } = await admin
    .from("mait_subscription_plans")
    .select("*")
    .eq("tier", parsed.data.tier)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const priceId =
    parsed.data.interval === "yearly"
      ? plan.stripe_yearly_price_id
      : plan.stripe_monthly_price_id;

  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe price not configured for this plan" },
      { status: 503 }
    );
  }

  // Get or create Stripe customer
  const { data: profile } = await admin
    .from("mait_users")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? "",
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await admin
      .from("mait_users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/credits?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/credits`,
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
