import Stripe from "stripe";

/**
 * Stripe client — only initialised when STRIPE_SECRET_KEY is set.
 * All Stripe-related routes should check for this before proceeding.
 */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
