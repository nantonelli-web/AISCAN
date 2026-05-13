import { createAdminClient } from "@/lib/supabase/admin";
import type { McpTool } from "../types";

/**
 * get_brand_overview — light-weight metadata per un brand su TUTTI
 * i canali in piattaforma. NON ritorna payload pesanti: solo conteggi
 * e date min/max per ogni canale. Cosi' Claude vede in 1 chiamata
 * "cosa c'e' di disponibile" e poi chiede all'utente quale canale
 * approfondire (via query_posts o get_benchmarks).
 *
 * Aggiungere un nuovo canale = aggiungere una chiave qui. Claude
 * lo vede automaticamente senza dover sapere che esista.
 */

interface CountResult {
  count: number;
  latestDate: string | null;
}

async function countWithLatestDate(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  workspaceId: string,
  brandId: string,
  dateColumn: string,
  extraFilter?: { column: string; value: string },
): Promise<CountResult> {
  let q = admin
    .from(table)
    .select(dateColumn, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("competitor_id", brandId)
    .not(dateColumn, "is", null)
    .order(dateColumn, { ascending: false })
    .limit(1);
  if (extraFilter) q = q.eq(extraFilter.column, extraFilter.value);
  const { data, count } = await q;
  const latest =
    Array.isArray(data) && data.length > 0
      ? ((data[0] as unknown) as Record<string, unknown>)[dateColumn]
      : null;
  return {
    count: count ?? 0,
    latestDate: typeof latest === "string" ? latest : null,
  };
}

export const getBrandOverviewTool: McpTool = {
  definition: {
    name: "get_brand_overview",
    description:
      "Dato un brand, ritorna i metadata di disponibilita' su TUTTI i canali presenti in AISCAN (paid Meta/Google, organic Instagram/Facebook/TikTok/YouTube, Adv Performance). Per ogni canale ritorna SOLO il numero di record e la data piu' recente — niente contenuto pesante. Usalo come PRIMO passo per capire cosa esiste per un brand prima di approfondire con query_posts o get_benchmarks (entrambi richiedono di specificare un canale).",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: {
          type: "string",
          format: "uuid",
          description: "UUID del brand (da list_brands o search_brand).",
        },
      },
      required: ["brand_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const brandId = String(args.brand_id ?? "").trim();
    if (!brandId) {
      return {
        content: [{ type: "text", text: "brand_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();

    const { data: brand } = await admin
      .from("mait_competitors")
      .select(
        "id, page_name, page_url, category, country, last_scraped_at, monitor_config, client_id, client:mait_clients(id, name, color)",
      )
      .eq("id", brandId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!brand) {
      return {
        content: [{ type: "text", text: "Brand non trovato nel workspace." }],
        isError: true,
      };
    }
    type BrandWithClient = {
      id: string;
      page_name: string | null;
      page_url: string | null;
      category: string | null;
      country: string | null;
      last_scraped_at: string | null;
      monitor_config: Record<string, unknown> | null;
      client_id: string | null;
      client?: { id: string; name: string | null; color: string | null } | null;
    };
    const b = (brand as unknown) as BrandWithClient;

    // Paid Meta + Google: count via mait_ads_external split per source
    const metaAds = await admin
      .from("mait_ads_external")
      .select("end_date, status", { count: "exact" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("created_at", { ascending: false })
      .limit(500);
    type AdLite = { end_date: string | null; status: string | null };
    const ads = (metaAds.data as AdLite[] | null) ?? [];
    const metaActive = ads.filter((a) => a.status === "ACTIVE").length;
    const latestAdDate =
      ads.find((a) => a.end_date)?.end_date ?? null;
    // Per separare Meta da Google servirebbe `source` ma `mait_ads_external`
    // non ha quella colonna esposta uniformemente. Lasciamo aggregato.

    // Organic IG/FB
    const orgIg = await countWithLatestDate(
      admin,
      "mait_organic_posts",
      ctx.workspaceId,
      brandId,
      "posted_at",
      { column: "platform", value: "instagram" },
    );
    const orgFb = await countWithLatestDate(
      admin,
      "mait_organic_posts",
      ctx.workspaceId,
      brandId,
      "posted_at",
      { column: "platform", value: "facebook" },
    );

    // TikTok
    const tiktok = await countWithLatestDate(
      admin,
      "mait_tiktok_posts",
      ctx.workspaceId,
      brandId,
      "posted_at",
    );

    // YouTube
    const ytChannel = await admin
      .from("mait_youtube_channels")
      .select("scraped_at, subscriber_count, total_videos", { count: "exact" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    type YtChannel = {
      scraped_at: string | null;
      subscriber_count: number | null;
      total_videos: number | null;
    };
    const ytChan = ytChannel.data as YtChannel | null;
    const ytVideos = await countWithLatestDate(
      admin,
      "mait_youtube_videos",
      ctx.workspaceId,
      brandId,
      "posted_at",
    );

    // Adv Performance (import file)
    const perfImports = await admin
      .from("mait_perf_imports")
      .select("channel, period_to, status", { count: "exact" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "validated")
      .order("period_to", { ascending: false })
      .limit(500);
    type PerfLite = {
      channel: string | null;
      period_to: string | null;
      status: string | null;
    };
    const perfRows = (perfImports.data as PerfLite[] | null) ?? [];
    // Group by channel
    const perfByChannel: Record<
      string,
      { imports: number; latest_period_to: string | null }
    > = {};
    for (const r of perfRows) {
      const ch = r.channel ?? "unknown";
      if (!perfByChannel[ch]) {
        perfByChannel[ch] = { imports: 0, latest_period_to: r.period_to };
      }
      perfByChannel[ch].imports++;
    }

    const overview = {
      brand: {
        id: b.id,
        name: b.page_name,
        url: b.page_url,
        category: b.category,
        countries: b.country,
        last_scraped_at: b.last_scraped_at,
        monitor_config: b.monitor_config,
        project: b.client
          ? { id: b.client.id, name: b.client.name }
          : null,
      },
      channels: {
        paid_ads: {
          // Meta + Google insieme (Apify-scraped ads, non distinguiamo
          // source a questo livello — usa query_posts con channel
          // specifico per dettaglio).
          ads_total: metaAds.count ?? 0,
          ads_active: metaActive,
          latest_end_date: latestAdDate,
          note:
            "Comprende Meta Ads Library + Google Ads Transparency. Per dettaglio per canale usa query_posts con channel=meta_ads o google_ads.",
        },
        organic_instagram: {
          posts_count: orgIg.count,
          latest_posted_at: orgIg.latestDate,
        },
        organic_facebook: {
          posts_count: orgFb.count,
          latest_posted_at: orgFb.latestDate,
        },
        organic_tiktok: {
          posts_count: tiktok.count,
          latest_posted_at: tiktok.latestDate,
        },
        organic_youtube: {
          has_channel: !!ytChan,
          subscriber_count: ytChan?.subscriber_count ?? null,
          total_videos: ytChan?.total_videos ?? null,
          last_scraped_at: ytChan?.scraped_at ?? null,
          videos_in_db: ytVideos.count,
          latest_video_posted_at: ytVideos.latestDate,
        },
        adv_performance: {
          imports_total: perfImports.count ?? 0,
          by_channel: perfByChannel,
          note:
            "Import Adv Performance sono file utente con KPI campagne. Per dettagli usa list_perf_imports + get_perf_dashboard.",
        },
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
    };
  },
};
