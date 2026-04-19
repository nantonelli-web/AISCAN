/**
 * Helpers for parsing Facebook page URLs / Meta Ad Library URLs.
 */

export function extractPageIdentifier(url: string): {
  username?: string;
  pageId?: string;
} {
  try {
    const u = new URL(url);
    // Check view_all_page_id parameter first (Ad Library URL)
    const paramId = u.searchParams.get("view_all_page_id");
    if (paramId) return { pageId: paramId };

    // facebook.com/<username> or facebook.com/<numeric_id>/
    if (u.hostname.includes("facebook.com")) {
      const seg = u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
      if (/^\d+$/.test(seg)) return { pageId: seg };
      if (seg && seg !== "ads") return { username: seg };
    }
  } catch {
    // not a URL — fall through
  }
  return {};
}

export function buildAdLibraryUrl(opts: {
  pageId?: string;
  searchQuery?: string;
  country?: string;
  active?: boolean;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const params = new URLSearchParams({
    active_status: opts.active === false ? "all" : "active",
    ad_type: "all",
    country: opts.country ?? "ALL",
    media_type: "all",
  });
  if (opts.pageId) {
    params.set("view_all_page_id", opts.pageId);
  } else if (opts.searchQuery) {
    // Fallback: search by name when page_id was not resolved
    params.set("q", opts.searchQuery);
  }
  // Append date params with literal brackets.
  // URLSearchParams encodes [] as %5B%5D which some scrapers don't handle.
  let qs = params.toString();
  if (opts.dateFrom) qs += `&start_date[min]=${opts.dateFrom}`;
  if (opts.dateTo) qs += `&start_date[max]=${opts.dateTo}`;
  return `https://www.facebook.com/ads/library/?${qs}`;
}
