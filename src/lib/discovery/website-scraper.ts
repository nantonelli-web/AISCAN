/**
 * Brand auto-discovery — Strategy A (HTML parsing, $0 marginal cost).
 *
 * Decision history: see project memory `project_brand_discovery_strategy`
 * (2026-05-04). User explicitly chose the free path first; LLM/Apify
 * extraction is reserved as a fallback for after the platform has
 * paying customers to justify the spend.
 *
 * What we extract from a single domain fetch:
 *   - page_name        from <title>, og:site_name, JSON-LD .name
 *   - page_url         Facebook page link found in footer/header anchors
 *   - instagram        @handle from instagram.com/<handle>/ links
 *   - tiktok           @handle from tiktok.com/@<handle> links
 *   - youtube          channel URL from youtube.com/{c,channel,@handle}
 *   - snapchat         handle from snapchat.com/add/<handle>
 *   - google_domain    derived directly from the input (eTLD+1)
 *   - category         heuristic from JSON-LD @type / og:type / meta keywords
 *
 * Country is NOT extracted — the user picks the scan target market
 * explicitly per brand (often differs from where the company is
 * legally based). Removed 2026-05-04 on user feedback.
 *
 * Each field comes back with a confidence score (0-100) so the UI
 * can pre-check high-confidence fields and let the user verify the
 * rest before saving.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 1_500_000; // 1.5 MB cap — fashion sites can be heavy

export interface DiscoveryField<T = string> {
  value: T | null;
  confidence: number; // 0-100
  source: string; // human-readable origin tag for debug + UI tooltip
}

export interface DiscoveryResult {
  domain: string;
  page_name: DiscoveryField;
  page_url: DiscoveryField;
  instagram_username: DiscoveryField;
  tiktok_username: DiscoveryField;
  youtube_channel_url: DiscoveryField;
  snapchat_handle: DiscoveryField;
  google_domain: DiscoveryField;
  category: DiscoveryField;
  /** Logo / favicon best-effort. Used as profile_picture_url initial
   *  value so the brand card doesn't render a generic placeholder
   *  before the first scan. */
  profile_picture_url: DiscoveryField;
  /** True iff the homepage fetch itself succeeded. False = the
   *  scrape returned no usable HTML (DNS error, 4xx/5xx, timeout)
   *  and the caller should show a "couldn't reach the site" UI. */
  fetched: boolean;
}

const empty = <T>(source = "—"): DiscoveryField<T> => ({
  value: null,
  confidence: 0,
  source,
});

/* ── Domain normalisation (mirrors src/lib/serp/service.ts) ──── */

const COMPOUND_SECOND_LEVEL = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "or",
  "ne",
  "mil",
]);

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//i, "");
  v = v.replace(/[/?#].*$/, "");
  v = v.replace(/:\d+$/, "");
  v = v.replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return null;
  const parts = v.split(".");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (
    last.length === 2 &&
    COMPOUND_SECOND_LEVEL.has(second) &&
    parts.length >= 3
  ) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

/** Coerce an arbitrary user input ("nike", "https://nike.com",
 *  "www.nike.com/it-it/products?foo=bar") into a fetchable HTTPS
 *  origin URL we can hit safely. Returns null when the input
 *  can't be massaged into something resembling a domain. */
function toFetchableUrl(input: string): { origin: string; bareDomain: string } | null {
  if (!input || typeof input !== "string") return null;
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".")) return null;
    return { origin: u.origin, bareDomain: normalizeDomain(u.hostname) ?? u.hostname };
  } catch {
    return null;
  }
}

/* ── HTML fetch with timeout + size cap ───────────────────────── */

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // A real browser UA gets through Cloudflare's bot heuristics
        // for 95% of sites without breaking robots semantics — we're
        // not crawling, just one homepage hit.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "it,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;

    // Stream-read with a 1.5MB cap so we don't OOM on a SPA that
    // ships a 30MB inlined hero video.
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) break;
      html += decoder.decode(value, { stream: true });
    }
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Extraction primitives ───────────────────────────────────── */

/** Pull all <meta property="X"> / <meta name="X"> values into a map. */
function extractMetaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<meta\s+([^>]+?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const propMatch = attrs.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content\s*=\s*["']([^"']*)["']/i);
    if (propMatch && contentMatch) {
      const key = propMatch[1].toLowerCase();
      const val = contentMatch[1].trim();
      if (val && !out.has(key)) out.set(key, val);
    }
  }
  return out;
}

/** Grab JSON-LD blocks and parse them defensively (some sites
 *  ship invalid JSON inside the script tag — skip those). */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed) out.push(parsed);
    } catch {
      // ignore malformed blocks — single bad block shouldn't
      // poison the whole discovery
    }
  }
  return out;
}

/** Pull every href attribute. Used to find social links + Facebook
 *  page link without manually walking the DOM. */
function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** First match against a list of regexes — we walk hrefs in order
 *  and return the first capture group from any pattern that hits. */
function firstHrefMatch(hrefs: string[], pattern: RegExp): string | null {
  for (const h of hrefs) {
    const m = h.match(pattern);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

function extractPageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim() || null;
}

/* ── Domain-specific extractors ──────────────────────────────── */

function extractInstagramHandle(hrefs: string[]): { value: string | null; confidence: number; source: string } {
  // Match instagram.com/<handle> ignoring trailing slash / query.
  // Filter out generic landing pages (instagram.com/help, /developer).
  const blacklist = new Set(["help", "developer", "p", "tv", "explore", "reels"]);
  for (const h of hrefs) {
    const m = h.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (m) {
      const handle = m[1].replace(/\/$/, "");
      if (!blacklist.has(handle.toLowerCase())) {
        return {
          value: handle,
          confidence: 90,
          source: "footer / header link",
        };
      }
    }
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractTikTokHandle(hrefs: string[]): { value: string | null; confidence: number; source: string } {
  for (const h of hrefs) {
    const m = h.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i);
    if (m) {
      return {
        value: m[1].replace(/\/$/, ""),
        confidence: 90,
        source: "footer / header link",
      };
    }
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractYoutubeChannelUrl(
  hrefs: string[],
): { value: string | null; confidence: number; source: string } {
  // YouTube has 3 link shapes: /@handle, /c/<custom>, /channel/<id>.
  // Prefer @handle (modern), then /c/, then /channel/. /watch URLs
  // are videos not channels, skip them.
  const patterns: { re: RegExp; conf: number }[] = [
    { re: /(https?:\/\/(?:www\.)?youtube\.com\/@[A-Za-z0-9_.-]+)/i, conf: 90 },
    { re: /(https?:\/\/(?:www\.)?youtube\.com\/c\/[A-Za-z0-9_.-]+)/i, conf: 80 },
    { re: /(https?:\/\/(?:www\.)?youtube\.com\/channel\/[A-Za-z0-9_-]+)/i, conf: 80 },
    { re: /(https?:\/\/(?:www\.)?youtube\.com\/user\/[A-Za-z0-9_.-]+)/i, conf: 70 },
  ];
  for (const p of patterns) {
    const found = firstHrefMatch(hrefs, p.re);
    if (found) {
      return { value: found, confidence: p.conf, source: "footer / header link" };
    }
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractSnapchatHandle(hrefs: string[]): { value: string | null; confidence: number; source: string } {
  for (const h of hrefs) {
    const m = h.match(/snapchat\.com\/add\/([A-Za-z0-9._-]+)/i);
    if (m) {
      return {
        value: m[1].replace(/\/$/, ""),
        confidence: 85,
        source: "footer / header link",
      };
    }
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractFacebookPageUrl(hrefs: string[]): { value: string | null; confidence: number; source: string } {
  // Facebook page links — filter out share/login/help links. Most
  // brand sites footer-link to facebook.com/<vanity> or /pages/X/Y.
  const blacklist = ["sharer", "share.php", "login", "help", "tr/", "policies", "settings"];
  for (const h of hrefs) {
    if (!/facebook\.com/i.test(h)) continue;
    if (blacklist.some((b) => h.toLowerCase().includes(b))) continue;
    // Normalise to absolute https URL.
    let url = h.startsWith("http") ? h : `https://${h.replace(/^\/+/, "")}`;
    // Strip query/fragment for a clean stored URL.
    url = url.replace(/[?#].*$/, "");
    return {
      value: url,
      confidence: 85,
      source: "footer / header link",
    };
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractCategory(
  jsonLd: unknown[],
  meta: Map<string, string>,
): { value: string | null; confidence: number; source: string } {
  // JSON-LD @type often carries Organization / LocalBusiness / Store,
  // sometimes more specific (ClothingStore, JewelryStore). Filter
  // out generic shells (WebSite, WebPage, Thing) which add noise.
  const generic = new Set(["website", "webpage", "thing", "creativework", "article"]);
  for (const block of jsonLd) {
    if (!block || typeof block !== "object") continue;
    const t = (block as { "@type"?: unknown })["@type"];
    if (typeof t === "string" && !generic.has(t.toLowerCase())) {
      return { value: t, confidence: 70, source: "JSON-LD @type" };
    }
    if (Array.isArray(t)) {
      const first = t.find((x) => typeof x === "string" && !generic.has(x.toLowerCase()));
      if (first) return { value: first as string, confidence: 70, source: "JSON-LD @type[]" };
    }
  }
  // Fall back to meta keywords first token — low confidence so
  // the user reviews it before saving.
  const kw = meta.get("keywords");
  if (kw) {
    const first = kw.split(",").map((s) => s.trim()).find(Boolean);
    if (first) return { value: first, confidence: 35, source: "meta keywords" };
  }
  return { value: null, confidence: 0, source: "—" };
}

function extractPageName(
  meta: Map<string, string>,
  jsonLd: unknown[],
  title: string | null,
  bareDomain: string,
): { value: string | null; confidence: number; source: string } {
  // Priority order: og:site_name → JSON-LD name → page <title>
  // (cleaned of " - X" / " | X" suffixes) → fallback to domain.
  const ogSite = meta.get("og:site_name") ?? meta.get("twitter:site");
  if (ogSite) return { value: ogSite, confidence: 85, source: "og:site_name" };

  for (const block of jsonLd) {
    if (!block || typeof block !== "object") continue;
    const t = (block as { "@type"?: unknown })["@type"];
    const name = (block as { name?: unknown }).name;
    const isOrg =
      typeof t === "string"
        ? /Organization|Brand|Store/i.test(t)
        : Array.isArray(t) && t.some((s) => typeof s === "string" && /Organization|Brand|Store/i.test(s));
    if (isOrg && typeof name === "string" && name.trim()) {
      return { value: name.trim(), confidence: 80, source: "JSON-LD Organization.name" };
    }
  }

  if (title) {
    // Strip everything after the first " - ", " | ", " · " separator —
    // these are usually the page tagline ("Brand - Official store").
    const cleaned = title.split(/\s+[-|·]\s+/)[0].trim();
    if (cleaned) return { value: cleaned, confidence: 60, source: "<title>" };
  }

  // Last resort: title-case the domain root.
  if (bareDomain) {
    const root = bareDomain.split(".")[0];
    const cap = root.charAt(0).toUpperCase() + root.slice(1);
    return { value: cap, confidence: 30, source: "domain root" };
  }

  return { value: null, confidence: 0, source: "—" };
}

function extractFavicon(
  html: string,
  origin: string,
  meta: Map<string, string>,
): { value: string | null; confidence: number; source: string } {
  // og:image is the highest-quality logo signal — it's usually a
  // full-resolution branded image picked by the site for social
  // shares, not a tiny 32×32 favicon.
  const ogImage = meta.get("og:image") ?? meta.get("twitter:image");
  if (ogImage) {
    const abs = ogImage.startsWith("http") ? ogImage : `${origin}${ogImage.startsWith("/") ? "" : "/"}${ogImage}`;
    return { value: abs, confidence: 80, source: "og:image" };
  }
  // Apple touch icons are usually 180×180 PNG with the brand logo.
  const apple = html.match(/<link[^>]+rel\s*=\s*["'](?:apple-touch-icon|apple-touch-icon-precomposed)["'][^>]+href\s*=\s*["']([^"']+)["']/i);
  if (apple) {
    const url = apple[1].startsWith("http") ? apple[1] : `${origin}${apple[1].startsWith("/") ? "" : "/"}${apple[1]}`;
    return { value: url, confidence: 70, source: "apple-touch-icon" };
  }
  // Standard favicon — small + low-res but better than nothing.
  const fav = html.match(/<link[^>]+rel\s*=\s*["'](?:icon|shortcut icon)["'][^>]+href\s*=\s*["']([^"']+)["']/i);
  if (fav) {
    const url = fav[1].startsWith("http") ? fav[1] : `${origin}${fav[1].startsWith("/") ? "" : "/"}${fav[1]}`;
    return { value: url, confidence: 40, source: "favicon" };
  }
  return { value: null, confidence: 0, source: "—" };
}

/* ── Top-level entry point ───────────────────────────────────── */

export async function discoverBrandFromDomain(
  rawDomain: string,
): Promise<DiscoveryResult> {
  const fetchable = toFetchableUrl(rawDomain);
  const bareDomain = fetchable?.bareDomain ?? normalizeDomain(rawDomain) ?? "";

  const result: DiscoveryResult = {
    domain: bareDomain,
    page_name: empty(),
    page_url: empty(),
    instagram_username: empty(),
    tiktok_username: empty(),
    youtube_channel_url: empty(),
    snapchat_handle: empty(),
    google_domain: bareDomain
      ? { value: bareDomain, confidence: 100, source: "input domain" }
      : empty(),
    category: empty(),
    profile_picture_url: empty(),
    fetched: false,
  };

  if (!fetchable) return result;

  const html = await fetchHtml(fetchable.origin);
  if (!html) return result;
  result.fetched = true;

  const meta = extractMetaTags(html);
  const jsonLd = extractJsonLd(html);
  const hrefs = extractHrefs(html);
  const title = extractPageTitle(html);

  result.page_name = extractPageName(meta, jsonLd, title, bareDomain);
  const fb = extractFacebookPageUrl(hrefs);
  result.page_url = fb;
  result.instagram_username = extractInstagramHandle(hrefs);
  result.tiktok_username = extractTikTokHandle(hrefs);
  result.youtube_channel_url = extractYoutubeChannelUrl(hrefs);
  result.snapchat_handle = extractSnapchatHandle(hrefs);
  result.category = extractCategory(jsonLd, meta);
  result.profile_picture_url = extractFavicon(html, fetchable.origin, meta);

  return result;
}
