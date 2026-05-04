/**
 * POST /api/brand-discovery
 *
 * Strategy A discovery — accepts `{ domain }`, scrapes the homepage
 * for OG tags / JSON-LD / footer social links, returns the best-
 * effort field map plus per-field confidence scores.
 *
 * Decision history: see project memory `project_brand_discovery_strategy`
 * (2026-05-04). Free path; LLM/Apify fallback exists in spec but is
 * not implemented until A's quality is measured against real brands.
 *
 * Authentication: required. The endpoint scrapes a third-party site
 * server-side under our IP — gating it behind auth prevents anonymous
 * users from turning AISCAN into an open scraping proxy.
 *
 * No credit charge — Strategy A costs us $0 marginal.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { discoverBrandFromDomain } from "@/lib/discovery/website-scraper";

export const maxDuration = 30;

const schema = z.object({
  domain: z.string().min(1).max(300),
});

export async function POST(req: Request) {
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
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    const result = await discoverBrandFromDomain(parsed.data.domain);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
