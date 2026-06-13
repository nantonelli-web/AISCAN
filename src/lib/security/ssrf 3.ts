/**
 * SSRF protection for server-side fetches of user-influenced URLs.
 *
 * The server fetches URLs derived from user input (brand-discovery
 * domains, scraped media URLs). Without a guard, an attacker can point
 * those at internal addresses (cloud metadata `169.254.169.254`,
 * `localhost`, RFC1918 hosts) and read the response or probe internal
 * services. `isPublicHttpUrl` resolves the hostname and rejects private
 * / loopback / link-local / reserved targets; `safeFetch` additionally
 * validates every redirect hop (a public host can 3xx to an internal
 * one).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  if (lower.startsWith("::ffff:")) return isPrivateIpv4(lower.slice(7));
  return false;
}

/** Host patterns trusted to skip DNS resolution (known public CDNs). */
const TRUSTED_CDN_HOST_PATTERNS = [
  /(?:^|\.)fbcdn\.net$/,
  /(?:^|\.)cdninstagram\.com$/,
  /(?:^|\.)scontent\..*$/,
];

function hostIsTrustedCdn(host: string): boolean {
  return TRUSTED_CDN_HOST_PATTERNS.some((p) => p.test(host));
}

export interface PublicUrlOptions {
  /** Allow the trusted-CDN allowlist to skip DNS resolution.
   *  Use only for fetching known media CDNs (default false). */
  allowCdn?: boolean;
  /** Restrict to https only (default false = http+https). */
  httpsOnly?: boolean;
}

/**
 * True only if `rawUrl` is an http(s) URL whose host resolves to a
 * PUBLIC address. Rejects literal private IPs and DNS names that
 * resolve to private/loopback/link-local/reserved ranges.
 */
export async function isPublicHttpUrl(
  rawUrl: string,
  opts: PublicUrlOptions = {},
): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (opts.httpsOnly) {
    if (u.protocol !== "https:") return false;
  } else if (u.protocol !== "http:" && u.protocol !== "https:") {
    return false;
  }
  const host = u.hostname;
  if (!host || host === "localhost") return false;

  const ipVer = isIP(host);
  if (ipVer === 4) return !isPrivateIpv4(host);
  if (ipVer === 6) return !isPrivateIpv6(host);

  if (opts.allowCdn && hostIsTrustedCdn(host)) return true;

  try {
    const { address, family } = await lookup(host);
    if (family === 4) return !isPrivateIpv4(address);
    if (family === 6) return !isPrivateIpv6(address);
    return false;
  } catch {
    return false;
  }
}

export class SsrfBlockedError extends Error {
  constructor(url: string) {
    super(`SSRF guard blocked a non-public URL: ${url}`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * fetch() wrapper that enforces the SSRF guard on the initial URL AND on
 * every redirect hop (redirect mode is forced to "manual" and each
 * Location re-validated). Throws SsrfBlockedError if any hop is
 * non-public. Caller still owns timeouts via init.signal.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: PublicUrlOptions & { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 4;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isPublicHttpUrl(current, opts))) {
      throw new SsrfBlockedError(current);
    }
    const res = await fetch(current, { ...init, redirect: "manual" });
    // 3xx with a Location → validate the next hop ourselves.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res; // no Location: hand it back as-is
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfBlockedError(`too many redirects from ${url}`);
}
