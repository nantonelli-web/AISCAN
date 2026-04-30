import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secrets";

/**
 * POST /api/settings/provider-keys/[provider]/test
 *
 * Smoke-test the workspace's stored key against the provider's
 * own auth endpoint. Updates `status`, `last_tested_at`, and
 * `last_test_error` accordingly so the Settings UI can show a
 * green/red badge without keeping the result in client state.
 *
 *  - Apify       → GET https://api.apify.com/v2/users/me
 *                  Returns 200 with { data: { id, username } } on
 *                  valid token; 401 on bad token.
 *  - OpenRouter  → GET https://openrouter.ai/api/v1/auth/key
 *                  Returns 200 with key info; 401 on bad token.
 */

const PROVIDERS = new Set(["apify", "openrouter"]);

interface TestOutcome {
  ok: boolean;
  error?: string;
}

async function testApifyToken(token: string): Promise<TestOutcome> {
  try {
    const res = await fetch("https://api.apify.com/v2/users/me", {
      headers: { authorization: `Bearer ${token}` },
      // Short timeout — a hung Apify endpoint must not block UI.
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Apify rejected the token (401 Unauthorized)" };
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Apify returned ${res.status}: ${body.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

async function testOpenRouterToken(token: string): Promise<TestOutcome> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "OpenRouter rejected the token (401 Unauthorized)" };
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `OpenRouter returned ${res.status}: ${body.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("role, workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  if (!["admin", "super_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Pull the stored ciphertext, decrypt, hand to the per-provider
  // tester. Decryption errors (master key missing/wrong) are
  // surfaced as 500 with a clear message so the operator can fix
  // env config without guessing.
  const { data: row, error: selErr } = await admin
    .from("mait_provider_keys")
    .select("id, encrypted_key")
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", provider)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json(
      { error: "No key configured for this provider" },
      { status: 404 },
    );
  }

  let plaintext: string;
  try {
    plaintext = decryptSecret(row.encrypted_key);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Decryption failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const outcome =
    provider === "apify"
      ? await testApifyToken(plaintext)
      : await testOpenRouterToken(plaintext);

  // Persist the test result so the UI badge survives reload and
  // the service layer (Phase 3) can refuse to dispatch on a key
  // that's flagged invalid without triggering yet-another HTTP
  // round trip to the provider.
  await admin
    .from("mait_provider_keys")
    .update({
      status: outcome.ok ? "active" : "invalid",
      last_tested_at: new Date().toISOString(),
      last_test_error: outcome.ok ? null : outcome.error ?? "Unknown error",
    })
    .eq("id", row.id);

  return NextResponse.json(outcome);
}
