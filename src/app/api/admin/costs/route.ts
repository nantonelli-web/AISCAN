import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  creditCosts,
  minEurPerCredit,
  usdToEur,
  EUR_USD_RATE,
  type CreditAction,
} from "@/config/pricing";

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
  // Margin needs the upstream USD totals to compute the top-level P&L,
  // so it runs after the two fetches (cheap DB-only work).
  const margin = await fetchMargin(apify.monthlyUsageUsd, llm.usage);

  return NextResponse.json({ llm, apify, margin });
}

/* ── Margin (EUR revenue vs USD real cost) ──────────────────────
 *
 * The currency bridge the app otherwise lacks: credits are SOLD in EUR
 * but every real cost (Apify, OpenRouter, cost cap) is in USD with no
 * FX feed. This block surfaces both so the admin can see whether the
 * business is actually in margin. Two views:
 *   1. Per-channel (last 30d) — uses our own `cost_cu` (the real USD
 *      Apify cost we record per job, now pay-per-event accurate) vs the
 *      EUR revenue implied by the credits charged for that channel.
 *   2. Upstream P&L — total fulfilled credit revenue (EUR) vs total
 *      upstream spend (Apify + OpenRouter, USD→EUR).
 * All EUR-from-USD uses the MANUAL EUR_USD_RATE; this is an estimate,
 * not accounting. */

interface ChannelMargin {
  source: string;
  scans: number;
  creditsPerScan: number;
  realCostUsd: number;
  revenueEur: number;
  costEur: number;
  marginEur: number;
  marginPct: number | null;
  /** True when margin is thin/negative — the admin should re-tune. */
  lowMargin: boolean;
}

interface MarginBlock {
  fxRate: number;
  windowDays: number;
  revenueEur30d: number;
  scrapingCostUsd30d: number;
  scrapingCostEur30d: number;
  channels: ChannelMargin[];
  upstream: {
    revenueEur30d: number;
    costUsdMtd: number;
    costEurMtd: number;
    marginEur: number;
    marginPct: number | null;
  };
  error?: string;
}

// mait_scrape_jobs.source → the CreditAction billed for that channel.
const SOURCE_TO_ACTION: Record<string, CreditAction> = {
  meta: "scan_meta",
  google: "scan_google",
  instagram: "scan_instagram",
  tiktok: "scan_tiktok",
  tiktok_ads: "scan_tiktok_ads",
  tiktok_cc: "scan_tiktok_cc",
  youtube: "scan_youtube",
  snapchat: "scan_snapchat",
  snapchat_ads: "scan_snapchat_ads",
  serp: "scan_serp",
  maps: "scan_maps",
};

const LOW_MARGIN_PCT = 50; // below this the admin should re-tune the price

async function fetchMargin(
  apifyUsdMtd: number,
  llmUsdMtd: number,
): Promise<MarginBlock> {
  const windowDays = 30;
  const eurPerCredit = minEurPerCredit();
  const empty: MarginBlock = {
    fxRate: EUR_USD_RATE,
    windowDays,
    revenueEur30d: 0,
    scrapingCostUsd30d: 0,
    scrapingCostEur30d: 0,
    channels: [],
    upstream: {
      revenueEur30d: 0,
      costUsdMtd: apifyUsdMtd + llmUsdMtd,
      costEurMtd: usdToEur(apifyUsdMtd + llmUsdMtd),
      marginEur: 0,
      marginPct: null,
    },
  };

  try {
    const admin = createAdminClient();
    const since = new Date(
      Date.now() - windowDays * 24 * 3_600_000,
    ).toISOString();

    // Revenue: fulfilled credit recharge requests in the window.
    const { data: reqs, error: reqErr } = await admin
      .from("mait_credit_requests")
      .select("package_price_eur, fulfilled_at")
      .eq("status", "fulfilled")
      .gte("fulfilled_at", since);
    if (reqErr) throw reqErr;
    const revenueEur30d = (reqs ?? []).reduce(
      (s, r) => s + Number((r as { package_price_eur: number }).package_price_eur ?? 0),
      0,
    );

    // Per-channel real cost from cost_cu (USD). Aggregate in JS — 30d of
    // jobs is small. Safety cap at 50k rows.
    const { data: jobs, error: jobErr } = await admin
      .from("mait_scrape_jobs")
      .select("source, cost_cu")
      .gte("started_at", since)
      .limit(50_000);
    if (jobErr) throw jobErr;

    const agg = new Map<string, { scans: number; costUsd: number }>();
    for (const j of jobs ?? []) {
      const row = j as { source: string | null; cost_cu: number | null };
      const src = row.source ?? "unknown";
      const cur = agg.get(src) ?? { scans: 0, costUsd: 0 };
      cur.scans += 1;
      cur.costUsd += Number(row.cost_cu ?? 0);
      agg.set(src, cur);
    }

    const channels: ChannelMargin[] = [...agg.entries()]
      .map(([source, v]) => {
        const action = SOURCE_TO_ACTION[source];
        const creditsPerScan = action ? creditCosts[action] : 0;
        const revenueEur = v.scans * creditsPerScan * eurPerCredit;
        const costEur = usdToEur(v.costUsd);
        const marginEur = revenueEur - costEur;
        const marginPct = revenueEur > 0 ? (marginEur / revenueEur) * 100 : null;
        return {
          source,
          scans: v.scans,
          creditsPerScan,
          realCostUsd: v.costUsd,
          revenueEur,
          costEur,
          marginEur,
          marginPct,
          lowMargin: marginPct !== null && marginPct < LOW_MARGIN_PCT,
        };
      })
      .sort((a, b) => b.realCostUsd - a.realCostUsd);

    const scrapingCostUsd30d = channels.reduce((s, c) => s + c.realCostUsd, 0);
    const upstreamCostUsd = apifyUsdMtd + llmUsdMtd;
    const upstreamCostEur = usdToEur(upstreamCostUsd);
    const upstreamMargin = revenueEur30d - upstreamCostEur;

    return {
      fxRate: EUR_USD_RATE,
      windowDays,
      revenueEur30d,
      scrapingCostUsd30d,
      scrapingCostEur30d: usdToEur(scrapingCostUsd30d),
      channels,
      upstream: {
        revenueEur30d,
        costUsdMtd: upstreamCostUsd,
        costEurMtd: upstreamCostEur,
        marginEur: upstreamMargin,
        marginPct: revenueEur30d > 0 ? (upstreamMargin / revenueEur30d) * 100 : null,
      },
    };
  } catch (e) {
    logger.error(
      "Margin computation failed",
      { channel: "admin/costs", event: "margin.failed" },
      e,
    );
    return { ...empty, error: e instanceof Error ? e.message : "DB error" };
  }
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
      logger.error("OpenRouter API error", {
        channel: "admin/costs",
        event: "openrouter.http_error",
        status: response.status,
        body: text.slice(0, 200),
      });
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
    logger.error(
      "OpenRouter fetch failed",
      { channel: "admin/costs", event: "openrouter.fetch_failed" },
      e,
    );
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
    logger.error(
      "Apify fetch failed",
      { channel: "admin/costs", event: "apify.fetch_failed" },
      e,
    );
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
