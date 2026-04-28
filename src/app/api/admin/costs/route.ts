import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/admin-jwt";

/**
 * Admin Costs API.
 *
 * Returns month-to-date usage for the two paid upstream services
 * AISCAN consumes:
 * - OpenRouter (LLM, AI Creative Analysis)
 * - Apify (every scraper)
 *
 * Each block is independent — if one provider's API fails, the
 * other still returns. The UI renders a warning per block on error.
 *
 * Mirrors AICREA's `/api/admin/costs` for the LLM half; the Apify
 * half is AISCAN-specific because AICREA does not use scrapers.
 */
export async function GET() {
  // Same admin JWT pattern as the rest of /api/admin/*
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminToken = await verifyAdminToken(token);
  if (!adminToken)
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const [llm, apify] = await Promise.all([fetchOpenRouter(), fetchApify()]);

  return NextResponse.json({ llm, apify });
}

/* ── OpenRouter ─────────────────────────────────────────────── */

interface OpenRouterUsage {
  /** USD spent on the key since billing cycle start. */
  usage: number;
  /** USD limit on the key, null when uncapped. */
  limit: number | null;
  is_free_tier: boolean;
  rate_limit: { requests: number; interval: string } | null;
  label: string | null;
  error?: string;
}

async function fetchOpenRouter(): Promise<OpenRouterUsage> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      usage: 0,
      limit: null,
      is_free_tier: false,
      rate_limit: null,
      label: null,
      error: "OPENROUTER_API_KEY not configured",
    };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "[admin/costs] OpenRouter API error:",
        response.status,
        text.slice(0, 200),
      );
      return {
        usage: 0,
        limit: null,
        is_free_tier: false,
        rate_limit: null,
        label: null,
        error: `Failed to fetch OpenRouter data (HTTP ${response.status})`,
      };
    }

    const json = await response.json();
    const keyData = json.data ?? json;

    return {
      usage: typeof keyData.usage === "number" ? keyData.usage : 0,
      limit: typeof keyData.limit === "number" ? keyData.limit : null,
      is_free_tier: keyData.is_free_tier === true,
      rate_limit: keyData.rate_limit ?? null,
      label: keyData.label ?? null,
    };
  } catch (e) {
    console.error("[admin/costs] OpenRouter fetch failed:", e);
    return {
      usage: 0,
      limit: null,
      is_free_tier: false,
      rate_limit: null,
      label: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/* ── Apify ──────────────────────────────────────────────────── */

interface ApifyServiceLine {
  service: string;
  quantity: number;
  amountUsd: number;
}

interface ApifyUsage {
  /** Plan slug, e.g. "STARTER", "SCALE", "BUSINESS". */
  planId: string | null;
  /** Plan base monthly cost in USD (informational — amount Apify
   *  bills NIMA every month regardless of usage). */
  planBasePriceUsd: number | null;
  /** USD of usage credits included in the plan; usage above this
   *  amount is billed on top of the base price. */
  monthlyCreditsUsd: number | null;
  /** Sum of `amountAfterVolumeDiscountUsd` across every service for
   *  the current usage cycle. */
  monthlyUsageUsd: number;
  /** Top-level breakdown by service (Actor compute, dataset reads,
   *  proxy traffic, etc.) — sorted by amount desc. */
  breakdown: ApifyServiceLine[];
  /** Current usage cycle ISO bounds. */
  cycleStart: string | null;
  cycleEnd: string | null;
  /** Apify username/email so the admin recognises which account
   *  the dashboard is reading from. */
  username: string | null;
  email: string | null;
  error?: string;
}

async function fetchApify(): Promise<ApifyUsage> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return {
      planId: null,
      planBasePriceUsd: null,
      monthlyCreditsUsd: null,
      monthlyUsageUsd: 0,
      breakdown: [],
      cycleStart: null,
      cycleEnd: null,
      username: null,
      email: null,
      error: "APIFY_API_TOKEN not configured",
    };
  }

  try {
    // Two parallel calls: profile (plan + identity) and usage (MTD
    // breakdown). Failure in either is non-fatal — we surface the
    // error string and zero out the affected fields.
    const [meRes, usageRes] = await Promise.all([
      fetch("https://api.apify.com/v2/users/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("https://api.apify.com/v2/users/me/usage/monthly", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);

    if (!meRes.ok) {
      return {
        planId: null,
        planBasePriceUsd: null,
        monthlyCreditsUsd: null,
        monthlyUsageUsd: 0,
        breakdown: [],
        cycleStart: null,
        cycleEnd: null,
        username: null,
        email: null,
        error: `Apify /users/me HTTP ${meRes.status}`,
      };
    }

    const meJson = await meRes.json();
    const me = meJson.data ?? meJson;
    const plan = me.plan ?? {};

    let monthlyUsageUsd = 0;
    let breakdown: ApifyServiceLine[] = [];
    let cycleStart: string | null = null;
    let cycleEnd: string | null = null;

    if (usageRes.ok) {
      const usageJson = await usageRes.json();
      const usage = usageJson.data ?? usageJson;
      cycleStart = usage.usageCycle?.startAt ?? null;
      cycleEnd = usage.usageCycle?.endAt ?? null;

      const services =
        (usage.monthlyServiceUsage as
          | Record<string, { quantity?: number; amountAfterVolumeDiscountUsd?: number }>
          | undefined) ?? {};
      for (const [service, payload] of Object.entries(services)) {
        const amount =
          typeof payload?.amountAfterVolumeDiscountUsd === "number"
            ? payload.amountAfterVolumeDiscountUsd
            : 0;
        monthlyUsageUsd += amount;
        breakdown.push({
          service,
          quantity: typeof payload?.quantity === "number" ? payload.quantity : 0,
          amountUsd: amount,
        });
      }
      // Sort biggest cost line first; the UI clips at 6 lines.
      breakdown = breakdown.sort((a, b) => b.amountUsd - a.amountUsd);
    }

    return {
      planId: typeof plan.id === "string" ? plan.id : null,
      planBasePriceUsd:
        typeof plan.monthlyBasePriceUsd === "number"
          ? plan.monthlyBasePriceUsd
          : null,
      monthlyCreditsUsd:
        typeof plan.monthlyUsageCreditsUsd === "number"
          ? plan.monthlyUsageCreditsUsd
          : null,
      monthlyUsageUsd,
      breakdown,
      cycleStart,
      cycleEnd,
      username: typeof me.username === "string" ? me.username : null,
      email: typeof me.email === "string" ? me.email : null,
    };
  } catch (e) {
    console.error("[admin/costs] Apify fetch failed:", e);
    return {
      planId: null,
      planBasePriceUsd: null,
      monthlyCreditsUsd: null,
      monthlyUsageUsd: 0,
      breakdown: [],
      cycleStart: null,
      cycleEnd: null,
      username: null,
      email: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
