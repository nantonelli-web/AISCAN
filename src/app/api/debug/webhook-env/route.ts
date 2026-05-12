import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/debug/webhook-env
 *
 * Diagnostico per verificare presenza delle env vars necessarie al
 * flow webhook Google scan. Auth-required (cookie Supabase) cosi non
 * e' un endpoint pubblico.
 *
 * Non espone valori sensibili: solo presenza (bool), length, mask del
 * prefisso per APIFY_WEBHOOK_SECRET; NEXT_PUBLIC_APP_URL e' valore
 * pubblico per definizione (il prefix NEXT_PUBLIC_ lo iniette nel
 * bundle client) quindi lo mostriamo intero.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.APIFY_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const apifyToken = process.env.APIFY_API_TOKEN;

  return NextResponse.json({
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_url: process.env.VERCEL_URL ?? null,
    node_env: process.env.NODE_ENV ?? null,
    deployment_at: new Date().toISOString(),
    env: {
      APIFY_WEBHOOK_SECRET: {
        present: !!secret,
        length: secret?.length ?? 0,
        prefix: secret ? `${secret.slice(0, 4)}…` : null,
      },
      NEXT_PUBLIC_APP_URL: {
        present: !!appUrl,
        value: appUrl ?? null,
      },
      APIFY_API_TOKEN: {
        present: !!apifyToken,
        length: apifyToken?.length ?? 0,
      },
    },
  });
}
