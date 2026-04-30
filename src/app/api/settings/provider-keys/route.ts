import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, maskedTail } from "@/lib/security/secrets";

/**
 * GET  /api/settings/provider-keys
 * POST /api/settings/provider-keys
 *
 * GET  → masked list of provider keys for the caller's workspace.
 *         Returns provider, last_4, label, status, last_tested_at —
 *         NEVER the encrypted ciphertext. Admin / super_admin only
 *         (RLS enforces, but we double-gate at the API level so the
 *         403 is explicit instead of a silent empty array).
 *
 * POST → upsert a key. Encrypts plaintext server-side, stores the
 *         ciphertext + last_4 + label. Resets status to "active"
 *         and clears last_tested_at so the UI prompts a fresh
 *         smoke test before the key is trusted at scan time.
 *
 *         Body: { provider: "apify"|"openrouter", key: string, label?: string }
 */

const PROVIDERS = ["apify", "openrouter"] as const;

const upsertSchema = z.object({
  provider: z.enum(PROVIDERS),
  key: z.string().min(8).max(500),
  label: z.string().trim().max(100).optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("id, role, workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return { error: "No workspace", status: 403 as const };
  }
  if (!["admin", "super_admin"].includes(profile.role as string)) {
    return { error: "Admin access required", status: 403 as const };
  }
  return { user, profile, admin };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const { admin, profile } = ctx;

  const { data, error } = await admin
    .from("mait_provider_keys")
    .select(
      "id, provider, last_4, label, status, last_tested_at, last_test_error, created_at, updated_at",
    )
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const { admin, profile } = ctx;

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Encrypt server-side; the plaintext key never leaves this scope.
  let encryptedKey: string;
  try {
    encryptedKey = encryptSecret(parsed.data.key);
  } catch (e) {
    // Most likely PROVIDER_KEYS_MASTER missing/malformed in env. Surface
    // the message clearly so the deploy operator knows what to fix.
    const message = e instanceof Error ? e.message : "Encryption failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const last4 = maskedTail(parsed.data.key);
  const row = {
    workspace_id: profile.workspace_id,
    provider: parsed.data.provider,
    encrypted_key: encryptedKey,
    last_4: last4,
    label: parsed.data.label ?? null,
    status: "active" as const,
    last_tested_at: null,
    last_test_error: null,
  };

  const { data, error } = await admin
    .from("mait_provider_keys")
    .upsert(row, { onConflict: "workspace_id,provider" })
    .select(
      "id, provider, last_4, label, status, last_tested_at, last_test_error, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ key: data });
}
