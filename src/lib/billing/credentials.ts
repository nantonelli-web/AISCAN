import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secrets";
import { getBillingMode, type BillingMode } from "./mode";

/**
 * Provider credential resolver.
 *
 * Returns the API token + a tag so the caller knows whether the run
 * is on AISCAN's managed env key (charge credits) or on the
 * workspace's BYO key (no charge, audit log under the BYO key id).
 *
 * Subscription-mode workspaces with no BYO key configured throw
 * `BillingError("MISSING_KEY", provider)`. Credit-mode workspaces
 * always succeed when the env key is present.
 */

export type ProviderName = "apify" | "openrouter";

export interface ResolvedCredentials {
  token: string;
  source: "managed" | "byo";
  /** mait_provider_keys.id when source="byo"; null otherwise. */
  keyRecordId: string | null;
  billingMode: BillingMode;
}

export class BillingError extends Error {
  code: "MISSING_KEY" | "INVALID_KEY" | "MISSING_ENV";
  provider: ProviderName;
  constructor(
    code: "MISSING_KEY" | "INVALID_KEY" | "MISSING_ENV",
    provider: ProviderName,
    message?: string,
  ) {
    super(
      message ??
        (code === "MISSING_KEY"
          ? `No ${provider} key configured for this workspace. Add one in Settings → Provider Keys.`
          : code === "INVALID_KEY"
            ? `The ${provider} key for this workspace was marked invalid by the last test. Re-test or replace it in Settings → Provider Keys.`
            : `${provider} env credential is not configured on the server.`),
    );
    this.name = "BillingError";
    this.code = code;
    this.provider = provider;
  }
}

async function resolveByoKey(
  workspaceId: string,
  provider: ProviderName,
): Promise<{ token: string; keyRecordId: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_provider_keys")
    .select("id, encrypted_key, status")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "invalid" || data.status === "revoked") {
    throw new BillingError("INVALID_KEY", provider);
  }
  const token = decryptSecret(data.encrypted_key as string);
  return { token, keyRecordId: data.id as string };
}

function resolveEnv(provider: ProviderName): string {
  const envName =
    provider === "apify" ? "APIFY_API_TOKEN" : "OPENROUTER_API_KEY";
  const value = process.env[envName];
  if (!value) {
    throw new BillingError(
      "MISSING_ENV",
      provider,
      `${envName} not set in environment.`,
    );
  }
  return value;
}

/**
 * Get an Apify token to use for the given workspace.
 *
 *   - Subscription mode + BYO key  → BYO (audit logs the key id)
 *   - Subscription mode + no key   → throws BillingError(MISSING_KEY)
 *   - Credits mode                 → managed env key (audit key id null)
 *
 * `workspaceId` is optional only for legacy callers that genuinely
 * have no workspace context (e.g. resolve-page-id called from a
 * helper). When omitted we ALWAYS fall back to env so we don't
 * break those paths — the caller's responsibility to ensure they
 * are not exposing subscription-mode workspaces to managed runs.
 */
export async function getApifyCredentials(
  workspaceId?: string,
): Promise<ResolvedCredentials> {
  if (!workspaceId) {
    return {
      token: resolveEnv("apify"),
      source: "managed",
      keyRecordId: null,
      billingMode: "credits",
    };
  }
  const billingMode = await getBillingMode(workspaceId);
  if (billingMode === "subscription") {
    const byo = await resolveByoKey(workspaceId, "apify");
    if (!byo) throw new BillingError("MISSING_KEY", "apify");
    return {
      token: byo.token,
      source: "byo",
      keyRecordId: byo.keyRecordId,
      billingMode,
    };
  }
  return {
    token: resolveEnv("apify"),
    source: "managed",
    keyRecordId: null,
    billingMode,
  };
}

/**
 * Get an OpenRouter API key to use for the given workspace. Same
 * semantics as getApifyCredentials.
 */
export async function getOpenRouterCredentials(
  workspaceId?: string,
): Promise<ResolvedCredentials> {
  if (!workspaceId) {
    return {
      token: resolveEnv("openrouter"),
      source: "managed",
      keyRecordId: null,
      billingMode: "credits",
    };
  }
  const billingMode = await getBillingMode(workspaceId);
  if (billingMode === "subscription") {
    const byo = await resolveByoKey(workspaceId, "openrouter");
    if (!byo) throw new BillingError("MISSING_KEY", "openrouter");
    return {
      token: byo.token,
      source: "byo",
      keyRecordId: byo.keyRecordId,
      billingMode,
    };
  }
  return {
    token: resolveEnv("openrouter"),
    source: "managed",
    keyRecordId: null,
    billingMode,
  };
}
