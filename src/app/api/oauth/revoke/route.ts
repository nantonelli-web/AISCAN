import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/oauth/tokens";

/**
 * POST /api/oauth/revoke (RFC 7009)
 *
 * Il client che possiede un token puo' invalidarlo programmaticamente.
 * Accettiamo sia access_token che refresh_token.
 *
 * Sempre 200 anche se il token non esiste (RFC: no information leak).
 */
export const maxDuration = 10;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let body: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const text = await req.text();
    const params = new URLSearchParams(text);
    for (const [k, v] of params.entries()) body[k] = v;
  }

  const token = body.token;
  if (!token) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing token" },
      { status: 400 },
    );
  }

  const hint = body.token_type_hint;
  const tokenHash = hashToken(token);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Prova access_token o refresh_token a seconda dell'hint; in
  // assenza di hint prova entrambi.
  if (hint !== "refresh_token") {
    await admin
      .from("mait_oauth_tokens")
      .update({ revoked_at: now })
      .eq("access_token_hash", tokenHash)
      .is("revoked_at", null);
  }
  if (hint !== "access_token") {
    await admin
      .from("mait_oauth_tokens")
      .update({ revoked_at: now })
      .eq("refresh_token_hash", tokenHash)
      .is("revoked_at", null);
  }

  return NextResponse.json({ ok: true });
}
