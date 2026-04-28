import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { creditPacks, getCreditPack } from "@/config/pricing";

/**
 * One-time payment for a credit pack. Mirror of the legacy
 * `/api/stripe/checkout` route but in `mode: "payment"` instead of
 * `subscription`. The pack id travels in `session.metadata.packId` so
 * the webhook can credit the right amount on `checkout.session.completed`.
 *
 * Pricing config is in `src/config/pricing.ts`. The actual Stripe
 * Price IDs sit in env vars (one per pack) so the catalogue can be
 * rotated in Stripe without redeploying.
 */
const schema = z.object({
  pack_id: z.enum(creditPacks.map((p) => p.id) as [string, ...string[]]),
});

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe non configurato. Imposta STRIPE_SECRET_KEY su Vercel e ridepiega." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const pack = getCreditPack(parsed.data.pack_id);
  const priceId = process.env[pack.stripePriceEnv];
  if (!priceId) {
    return NextResponse.json(
      {
        error: `Stripe price non configurato per il pack "${pack.name}". Imposta ${pack.stripePriceEnv} su Vercel.`,
      },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // Resolve workspace owner id — packs credit the workspace, not the
  // individual buyer, so any team member can recharge on behalf of
  // their workspace.
  const { data: profile } = await admin
    .from("mait_users")
    .select("id, email, stripe_customer_id, workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Find or create a Stripe customer for the user. Reuse the one set
  // by the legacy subscription checkout to keep a single profile in
  // Stripe per AISCAN account.
  let customerId = profile.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? user.email ?? "",
      metadata: { userId: user.id, workspaceId: profile.workspace_id },
    });
    customerId = customer.id;
    await admin
      .from("mait_users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Resolve workspace owner so the webhook credits the right balance
  // — for a single-member workspace this is the same id, for teams
  // the credits always land on the founder.
  const { data: owner } = await admin
    .from("mait_users")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const ownerId = owner?.id ?? user.id;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    // ⚠ The webhook reads these fields on
    // `checkout.session.completed` — keep names in sync with
    // src/app/api/stripe/webhook/route.ts.
    metadata: {
      userId: user.id,
      ownerId,
      workspaceId: profile.workspace_id,
      packId: pack.id,
      credits: String(pack.credits),
    },
    success_url: `${baseUrl}/credits?recharge=ok&pack=${pack.id}`,
    cancel_url: `${baseUrl}/credits?recharge=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
