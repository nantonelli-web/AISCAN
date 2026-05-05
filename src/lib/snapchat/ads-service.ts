/**
 * Snap Ads Library — official public REST API.
 *
 * Endpoint: https://adsapi.snapchat.com/v1/ads_library/ads/search
 * Auth:     none (public DSA endpoint)
 * Coverage: ads served in the EU in the last 12 months
 *
 * Decision history & rationale: project memory `project_snapchat_ads_api`.
 * Verified live on 2026-05-05 against `paying_advertiser_name=nike`.
 *
 * No Apify, no rental fee, no per-result cost — egress only. Pagination
 * via `paging.next_link` cursor with no documented hard cap; we apply
 * a `maxResults` safety stop client-side so a runaway brand cannot hang
 * the scan indefinitely.
 */

import { SNAP_ADS_EU_COUNTRIES } from "@/lib/snapchat/eu-countries";

const SNAP_API_BASE = "https://adsapi.snapchat.com/v1/ads_library";

/** Default country list when the caller doesn't specify — matches the
 *  full EU-27 scope advertised in Snap's DSA coverage. */
const DEFAULT_EU_COUNTRIES = [...SNAP_ADS_EU_COUNTRIES];

export interface SnapchatAdsScrapeOptions {
  /** Brand search key. Sent verbatim as `paying_advertiser_name` —
   *  Snap matches by substring, case-insensitive. Use the brand's
   *  page_name when no dedicated handle is available. */
  brandName: string;
  /** ISO-2 (lowercase) country codes. Falls back to all EU-27. */
  countries?: string[];
  /** Inclusive start of the search window. Defaults to 12 months ago,
   *  matching the API's own coverage limit. */
  dateFrom?: Date;
  /** Inclusive end of the search window. Defaults to now. */
  dateTo?: Date;
  /** ACTIVE | PAUSED. Snap returns ACTIVE if omitted. */
  status?: "ACTIVE" | "PAUSED";
  /** Hard ceiling on total ads pulled across all paginated pages.
   *  Defaults to 500 — enough for any DSA-grade brand without
   *  inflating storage. */
  maxResults?: number;
}

/** Shape we persist on `mait_snapchat_ads`. Keys mirror the DB columns
 *  one-for-one so the route can spread the row directly. */
export interface NormalizedSnapchatAd {
  ad_id: string;
  name: string | null;
  ad_account_name: string | null;
  paying_advertiser_name: string;
  profile_name: string | null;
  profile_logo_url: string | null;
  status: string | null;
  creative_type: string | null;
  ad_type: string | null;
  ad_render_type: string | null;
  top_snap_media_type: string | null;
  top_snap_crop_position: string | null;
  headline: string | null;
  call_to_action: string | null;
  languages: string[];
  impressions_total: number;
  impressions_map: Record<string, number> | null;
  targeting_v2: Record<string, unknown> | null;
  dpa_preview: Record<string, unknown> | null;
  start_date: string | null;
  end_date: string | null;
  raw_data: Record<string, unknown>;
}

export interface SnapchatAdsScrapeResult {
  ads: NormalizedSnapchatAd[];
  pagesFetched: number;
  /** Cost in USD for the credit ledger. Always 0 — Snap's API is free. */
  costCu: number;
}

/* ── Raw API shapes (only the fields we read) ────────────────────── */

interface RawAdPreview {
  id: string;
  name?: string;
  ad_account_name?: string;
  paying_advertiser_name?: string;
  profile_name?: string;
  profile_logo_url?: string;
  status?: string;
  creative_type?: string;
  ad_type?: string;
  ad_render_type?: string;
  top_snap_media_type?: string;
  top_snap_crop_position?: string;
  headline?: string;
  call_to_action?: string;
  languages?: string[];
  impressions_total?: number;
  impressions_map?: Record<string, number>;
  targeting_v2?: Record<string, unknown>;
  dpa_preview?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  [k: string]: unknown;
}

interface RawSearchResponse {
  request_status?: string;
  request_id?: string;
  paging?: { next_link?: string };
  ad_previews?: Array<{
    sub_request_status?: string;
    ad_preview?: RawAdPreview;
  }>;
}

/* ── Normalise ───────────────────────────────────────────────────── */

function normalizeAd(raw: RawAdPreview, fallbackBrand: string): NormalizedSnapchatAd | null {
  if (!raw.id) return null;
  return {
    ad_id: raw.id,
    name: raw.name ?? null,
    ad_account_name: raw.ad_account_name ?? null,
    paying_advertiser_name: raw.paying_advertiser_name ?? fallbackBrand,
    profile_name: raw.profile_name ?? null,
    profile_logo_url: raw.profile_logo_url ?? null,
    status: raw.status ?? null,
    creative_type: raw.creative_type ?? null,
    ad_type: raw.ad_type ?? null,
    ad_render_type: raw.ad_render_type ?? null,
    top_snap_media_type: raw.top_snap_media_type ?? null,
    top_snap_crop_position: raw.top_snap_crop_position ?? null,
    headline: raw.headline ?? null,
    call_to_action: raw.call_to_action ?? null,
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    impressions_total:
      typeof raw.impressions_total === "number" ? raw.impressions_total : 0,
    impressions_map: raw.impressions_map ?? null,
    targeting_v2: raw.targeting_v2 ?? null,
    dpa_preview: raw.dpa_preview ?? null,
    start_date: raw.start_date ?? null,
    end_date: raw.end_date ?? null,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

/* ── Public scrape ───────────────────────────────────────────────── */

export async function scrapeSnapchatAds(
  opts: SnapchatAdsScrapeOptions,
): Promise<SnapchatAdsScrapeResult> {
  const brandName = (opts.brandName ?? "").trim();
  if (!brandName) {
    throw new Error("brandName is required for Snapchat Ads scrape.");
  }

  // Normalise + filter the caller's country list against the EU-27
  // whitelist. Non-EU codes (e.g. `qa`, `us`, `ae`) are dropped here
  // rather than at the call site — the API rejects them with HTTP 400,
  // and brands often carry a mixed-market country list on
  // `mait_competitors.country`. If after filtering nothing remains,
  // fall back to the full EU-27 default so the brand still gets a
  // meaningful scan instead of an empty-input error.
  // Normalise + remap: Snap uses `el` for Greece, but brand records
  // may carry the more common `gr` — translate before the whitelist
  // check so the user's intent is preserved.
  const requested =
    opts.countries && opts.countries.length > 0
      ? opts.countries.map((c) => {
          const lower = c.toLowerCase();
          return lower === "gr" ? "el" : lower;
        })
      : null;
  const filteredEu = requested
    ? requested.filter((c) => SNAP_ADS_EU_COUNTRIES.has(c))
    : null;
  const dropped = requested
    ? requested.filter((c) => !SNAP_ADS_EU_COUNTRIES.has(c))
    : [];
  if (dropped.length > 0) {
    console.log(
      `[SnapchatAds] Dropping non-EU countries from request: ${dropped.join(", ")} (Snap DSA API is EU-only).`,
    );
  }
  const countries =
    filteredEu && filteredEu.length > 0 ? filteredEu : DEFAULT_EU_COUNTRIES;

  // 12-month window matches the API's own coverage limit. Going wider
  // returns the same data — we keep the cap explicit so the user-facing
  // "EU, last 12 months" notice stays truthful.
  const now = opts.dateTo ?? new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const startDate = opts.dateFrom ?? twelveMonthsAgo;

  const status = opts.status ?? "ACTIVE";
  const maxResults = opts.maxResults ?? 500;

  const body = {
    paying_advertiser_name: brandName,
    countries,
    start_date: startDate.toISOString(),
    end_date: now.toISOString(),
    status,
  };

  console.log(
    `[SnapchatAds] Search start: brand="${brandName}" countries=${countries.length} status=${status} max=${maxResults}`,
  );

  const ads: NormalizedSnapchatAd[] = [];
  let cursorUrl: string | null = `${SNAP_API_BASE}/ads/search`;
  let pagesFetched = 0;
  // Defence-in-depth: even with maxResults set, cap the page count so a
  // misbehaving cursor cannot loop forever.
  const maxPages = 50;

  while (cursorUrl && ads.length < maxResults && pagesFetched < maxPages) {
    const res: Response = await fetch(cursorUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Snap Ads API ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as RawSearchResponse;
    pagesFetched++;

    if (json.request_status && json.request_status !== "SUCCESS") {
      throw new Error(`Snap Ads API request_status=${json.request_status}`);
    }

    for (const item of json.ad_previews ?? []) {
      if (item.sub_request_status !== "SUCCESS" || !item.ad_preview) continue;
      const normalized = normalizeAd(item.ad_preview, brandName);
      if (normalized) {
        ads.push(normalized);
        if (ads.length >= maxResults) break;
      }
    }

    cursorUrl = json.paging?.next_link ?? null;
    console.log(
      `[SnapchatAds] Page ${pagesFetched}: ${ads.length} ads so far${cursorUrl ? ", cursor present" : ", no more pages"}`,
    );
  }

  console.log(
    `[SnapchatAds] Done: ${ads.length} ads in ${pagesFetched} pages.`,
  );

  return { ads, pagesFetched, costCu: 0 };
}
