/**
 * Collaborazioni L2 — classificazione AI degli account collaboratori.
 *
 * Classifica ogni handle in brand / influencer / celebrity / staff /
 * unknown via OpenRouter, in UNA chiamata batch per chunk (input =
 * lista account con i campi L3 quando disponibili). Fa l'upsert dei
 * SOLI campi L2 in mait_collab_accounts (non tocca l'enrichment L3).
 *
 * Costo: il chiamante addebita UN solo ai_analysis_<tier> per l'intera
 * operazione, anche se internamente spezziamo in piu' chunk per tenere
 * il JSON parseabile. La classifica e' molto piu' affidabile DOPO
 * l'enrichment (bio + follower + verified come input).
 *
 * Gated da COLLAB_CLASSIFY_ENABLED a monte (nelle route / UI): qui
 * assumiamo che il flag sia gia' stato verificato.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenRouterCredentials } from "@/lib/billing/credentials";
import { DEFAULT_TIER, type ModelTier } from "@/lib/ai/creative-analysis";
import type {
  CollabClassification,
  CollabPlatform,
} from "@/lib/organic/collab-intel";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Modello testuale per tier (la classifica e' solo testo, niente
 *  vision). Stessi model id dei tier Compare, ramo "copywriter". */
const CLASSIFY_MODELS: Record<ModelTier, string> = {
  cheap: "deepseek/deepseek-v3.2",
  pragmatic: "anthropic/claude-haiku-4.5",
  premium: "anthropic/claude-sonnet-4.5",
};

const VALID: ReadonlySet<CollabClassification> = new Set([
  "brand",
  "influencer",
  "celebrity",
  "staff",
  "unknown",
]);

/** Account da classificare. I campi L3 sono opzionali: per TikTok
 *  (niente enrichment) arriva solo handle, e il modello classifica con
 *  meno contesto (confidence piu' bassa). */
export interface AccountToClassify {
  handle: string;
  platform: CollabPlatform;
  full_name?: string | null;
  biography?: string | null;
  verified?: boolean | null;
  followers_count?: number | null;
  category?: string | null;
}

export interface ClassifyResult {
  classified: number;
  modelId: string;
}

const CHUNK = 50;

function stripFences(text: string): string {
  return text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
}

interface RawClassification {
  handle?: string;
  classification?: string;
  confidence?: number;
  reason?: string;
}

function buildPrompt(
  brandName: string,
  accounts: AccountToClassify[],
  locale: "it" | "en",
): string {
  const lang =
    locale === "it"
      ? "Scrivi il campo `reason` in italiano (max 12 parole)."
      : "Write the `reason` field in English (max 12 words).";

  const list = accounts
    .map((a, i) => {
      const parts: string[] = [`${i + 1}. @${a.handle}`];
      if (a.full_name) parts.push(`name: ${a.full_name}`);
      if (a.verified != null) parts.push(`verified: ${a.verified ? "yes" : "no"}`);
      if (a.followers_count != null)
        parts.push(`followers: ${a.followers_count}`);
      if (a.category) parts.push(`category: ${a.category}`);
      if (a.biography)
        parts.push(`bio: ${a.biography.replace(/\s+/g, " ").slice(0, 280)}`);
      return parts.join(" | ");
    })
    .join("\n");

  return `You classify social media accounts that the fashion/lifestyle brand "${brandName}" tagged or mentioned in its organic posts. For EACH account, decide what KIND of account it is.

Categories (pick exactly one):
- "brand": a company / label / retailer / publication account (another brand, magazine, store, product line). NOT the person.
- "influencer": an individual content creator / blogger / model / KOL whose following comes from social content, and who partners with brands.
- "celebrity": a famous public figure whose fame exists beyond social media (actor, musician, athlete, designer-celebrity, TV personality).
- "staff": an internal account of "${brandName}" itself — employees, founders, in-house designers, a sub-brand/line account, or a regional/official account of the same brand.
- "unknown": genuinely not enough signal to decide.

Guidance:
- A high follower count + personal name + lifestyle bio → usually influencer or celebrity. Distinguish celebrity (off-platform fame) from influencer (social-native).
- A business category, a brand-like handle, or a company name → "brand".
- Handles that look like the brand itself, or "<brand> official / <brand> <country>" → "staff".
- When only the handle is available (no bio/followers), infer from the handle text but lower the confidence.
- "confidence" is 0.0–1.0: how sure you are. Be honest; thin input = low confidence.
${lang}

Accounts:
${list}

Return ONLY a JSON object, no markdown, no commentary:
{
  "accounts": [
    { "handle": "<exact handle without @>", "classification": "brand|influencer|celebrity|staff|unknown", "confidence": 0.0, "reason": "..." }
  ]
}
Return one entry per account above, echoing the EXACT handle.`;
}

async function classifyChunk(
  apiKey: string,
  modelId: string,
  brandName: string,
  accounts: AccountToClassify[],
  locale: "it" | "en",
): Promise<Map<string, RawClassification>> {
  const out = new Map<string, RawClassification>();
  const prompt = buildPrompt(brandName, accounts, locale);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "AISCAN - Collaborator Classification",
      },
      body: JSON.stringify({
        model: modelId,
        // ~60 token/account + headroom, cap a 8000.
        max_tokens: Math.min(8000, 300 + accounts.length * 70),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "<no body>");
      console.error(
        `[collab-classify] OpenRouter ${res.status} (model=${modelId}): ${errBody.slice(0, 400)}`,
      );
      return out;
    }
    const body = await res.json();
    const text: string | null = body.choices?.[0]?.message?.content ?? null;
    if (!text) return out;

    let parsed: { accounts?: RawClassification[] };
    try {
      parsed = JSON.parse(stripFences(text));
    } catch (e) {
      console.error(
        `[collab-classify] JSON parse failed (model=${modelId}): ${(e as Error).message}`,
      );
      return out;
    }
    for (const r of parsed.accounts ?? []) {
      if (!r.handle) continue;
      out.set(r.handle.replace(/^@/, "").toLowerCase(), r);
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error(`[collab-classify] threw (model=${modelId}):`, e);
  }
  return out;
}

/**
 * Classifica gli account passati (gia' filtrati a "needsClassification"
 * dal chiamante) e fa l'upsert dei campi L2. `brandName` da' contesto
 * al modello per distinguere lo staff del brand stesso.
 */
export async function classifyCollaborators(opts: {
  workspaceId: string;
  brandName: string;
  accounts: AccountToClassify[];
  tier?: ModelTier;
  locale?: "it" | "en";
}): Promise<ClassifyResult> {
  const { workspaceId, brandName, accounts } = opts;
  const tier = opts.tier ?? DEFAULT_TIER;
  const locale = opts.locale ?? "it";
  const modelId = CLASSIFY_MODELS[tier];

  if (accounts.length === 0) return { classified: 0, modelId };

  let apiKey: string;
  try {
    const creds = await getOpenRouterCredentials(workspaceId);
    apiKey = creds.token;
  } catch (e) {
    console.error("[collab-classify] credentials error:", e);
    return { classified: 0, modelId };
  }

  // Una chiamata per chunk; merge dei risultati.
  const merged = new Map<string, RawClassification>();
  for (let i = 0; i < accounts.length; i += CHUNK) {
    const chunk = accounts.slice(i, i + CHUNK);
    const res = await classifyChunk(apiKey, modelId, brandName, chunk, locale);
    for (const [k, v] of res) merged.set(k, v);
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const a of accounts) {
    const r = merged.get(a.handle.toLowerCase());
    if (!r) continue;
    const cls = (r.classification ?? "").toLowerCase() as CollabClassification;
    const classification: CollabClassification = VALID.has(cls)
      ? cls
      : "unknown";
    const confidence =
      typeof r.confidence === "number"
        ? Math.max(0, Math.min(1, r.confidence))
        : null;
    rows.push({
      workspace_id: workspaceId,
      handle: a.handle,
      platform: a.platform,
      classification,
      classification_confidence: confidence,
      classification_reason:
        typeof r.reason === "string" ? r.reason.slice(0, 300) : null,
      classification_model_tier: tier,
      classification_model_id: modelId,
      classified_at: now,
      updated_at: now,
    });
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("mait_collab_accounts")
      .upsert(rows, { onConflict: "workspace_id,handle,platform" });
    if (error) {
      console.error("[collab-classify] upsert error:", error);
      throw new Error("collab classification upsert failed");
    }
  }

  return { classified: rows.length, modelId };
}
