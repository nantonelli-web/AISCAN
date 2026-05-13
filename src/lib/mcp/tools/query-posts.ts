import { createAdminClient } from "@/lib/supabase/admin";
import { classifyGoogleStrategy } from "@/lib/analytics/google-strategy";
import type { McpTool } from "../types";

/**
 * query_posts — tool unico per leggere "contenuti" (ads paid, post
 * organic, video YouTube) cross-channel. Channel obbligatorio cosi'
 * Claude DEVE chiedere all'utente di specificare il canale prima
 * di chiamarlo (no caccia al tesoro, no overload di token).
 *
 * Channel supportati:
 *   - meta_ads:           mait_ads_external paid Meta
 *   - google_ads:         mait_ads_external paid Google
 *     (filtriamo via mait_scrape_jobs.source, fallback su raw_data)
 *   - instagram_organic:  mait_organic_posts platform=instagram
 *   - facebook_organic:   mait_organic_posts platform=facebook
 *   - tiktok_organic:     mait_tiktok_posts
 *   - youtube_organic:    mait_youtube_videos
 *
 * Quando aggiungiamo un nuovo canale, basta estendere lenum + uno
 * switch case qui dentro. Claude lo scopre automaticamente dal
 * description.
 */

type ChannelKey =
  | "meta_ads"
  | "google_ads"
  | "instagram_organic"
  | "facebook_organic"
  | "tiktok_organic"
  | "youtube_organic";

const ALL_CHANNELS: ChannelKey[] = [
  "meta_ads",
  "google_ads",
  "instagram_organic",
  "facebook_organic",
  "tiktok_organic",
  "youtube_organic",
];

export const queryPostsTool: McpTool = {
  definition: {
    name: "query_posts",
    description:
      "Lista 'contenuti' (ads paid o post organic) di un brand su UN canale specifico. Channel obbligatorio per evitare overload di token: se l'utente fa una domanda generica, CHIEDIGLI prima quale canale gli interessa fra meta_ads, google_ads, instagram_organic, facebook_organic, tiktok_organic, youtube_organic. Per scoprire quali canali hanno dati per un brand usa get_brand_overview.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string", format: "uuid" },
        channel: {
          type: "string",
          enum: ALL_CHANNELS,
          description:
            "Canale obbligatorio. meta_ads/google_ads = paid (Meta Ads Library, Google Ads Transparency). *_organic = post organici di quella piattaforma.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Default 20.",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE"],
          description:
            "Solo per channel=meta_ads/google_ads. Filtra le ads per stato.",
        },
        date_from: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD. Filtra al campo data principale del canale (start_date per ads, posted_at per organic).",
        },
        date_to: { type: "string" },
      },
      required: ["brand_id", "channel"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const brandId = String(args.brand_id ?? "").trim();
    const channel = args.channel as ChannelKey;
    const limit = typeof args.limit === "number" ? args.limit : 20;
    if (!brandId) {
      return {
        content: [{ type: "text", text: "brand_id obbligatorio" }],
        isError: true,
      };
    }
    if (!ALL_CHANNELS.includes(channel)) {
      return {
        content: [
          {
            type: "text",
            text: `channel obbligatorio. Valori validi: ${ALL_CHANNELS.join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    const admin = createAdminClient();
    const dateFrom = typeof args.date_from === "string" ? args.date_from : null;
    const dateTo = typeof args.date_to === "string" ? args.date_to : null;
    const status = typeof args.status === "string" ? args.status : null;

    // Paid ads (Meta + Google): unica tabella mait_ads_external. Per
    // distinguere usiamo il join con mait_scrape_jobs.source quando
    // possibile; in mancanza ritorniamo entrambi col channel
    // dichiarato e ignoriamo (best effort).
    if (channel === "meta_ads" || channel === "google_ads") {
      let q = admin
        .from("mait_ads_external")
        .select(
          "id, ad_archive_id, headline, ad_text, cta, platforms, status, start_date, end_date, landing_url, image_url, video_url, raw_data",
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("competitor_id", brandId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (status) q = q.eq("status", status);
      if (dateFrom) q = q.gte("start_date", dateFrom);
      if (dateTo) q = q.lte("start_date", dateTo);
      // Filtraggio per channel via platforms array. Meta ads hanno
      // platforms tipo ["facebook","instagram"]; Google ha
      // ["google_search","display","youtube"]. Heuristica.
      if (channel === "meta_ads") {
        q = q.overlaps("platforms", ["facebook", "instagram", "audience_network", "messenger"]);
      } else if (channel === "google_ads") {
        q = q.overlaps("platforms", ["google_search", "display", "youtube"]);
      }
      const { data, error } = await q;
      if (error)
        return {
          content: [{ type: "text", text: `Errore DB: ${error.message}` }],
          isError: true,
        };
      // Enrich Google ads with campaign strategy (PMax/Demand Gen/...)
      // computed live dal raw_data. Su Meta saltiamo (classifyGoogleStrategy
      // ritornerebbe unknown su format non TEXT/VIDEO/IMAGE).
      let items: unknown[] = data ?? [];
      if (channel === "google_ads") {
        items = (data ?? []).map((ad) => {
          const r = ad as { raw_data?: unknown };
          const raw = r.raw_data ?? null;
          const format = raw && typeof raw === "object"
            ? (raw as Record<string, unknown>).format
            : null;
          const cls = classifyGoogleStrategy(
            raw,
            typeof format === "string" ? format : null,
          );
          // Strippo raw_data dal return (pesante, non utile a Claude)
          // e aggiungo solo strategy + confidence + surfaces.
          const { raw_data: _drop, ...rest } = ad as Record<string, unknown>;
          void _drop;
          return {
            ...rest,
            strategy: cls.strategy,
            strategy_confidence: cls.confidence,
            surfaces: cls.surfaces,
          };
        });
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { channel, count: items.length, items },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (channel === "instagram_organic" || channel === "facebook_organic") {
      const platform =
        channel === "instagram_organic" ? "instagram" : "facebook";
      let q = admin
        .from("mait_organic_posts")
        .select(
          "id, platform, post_id, post_url, post_type, caption, likes_count, comments_count, video_views, shares_count, hashtags, mentions, tagged_users, posted_at",
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("competitor_id", brandId)
        .eq("platform", platform)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (dateFrom) q = q.gte("posted_at", dateFrom);
      if (dateTo) q = q.lte("posted_at", dateTo);
      const { data, error } = await q;
      if (error)
        return {
          content: [{ type: "text", text: `Errore DB: ${error.message}` }],
          isError: true,
        };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { channel, count: (data ?? []).length, items: data ?? [] },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (channel === "tiktok_organic") {
      let q = admin
        .from("mait_tiktok_posts")
        .select(
          "id, post_id, post_url, caption, duration_seconds, is_slideshow, play_count, digg_count, share_count, comment_count, collect_count, music_name, music_author, music_original, hashtags, mentions, posted_at",
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("competitor_id", brandId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (dateFrom) q = q.gte("posted_at", dateFrom);
      if (dateTo) q = q.lte("posted_at", dateTo);
      const { data, error } = await q;
      if (error)
        return {
          content: [{ type: "text", text: `Errore DB: ${error.message}` }],
          isError: true,
        };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { channel, count: (data ?? []).length, items: data ?? [] },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (channel === "youtube_organic") {
      let q = admin
        .from("mait_youtube_videos")
        .select(
          "id, video_id, video_url, title, description, type, duration_seconds, view_count, like_count, comment_count, posted_at, posted_relative",
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("competitor_id", brandId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (dateFrom) q = q.gte("posted_at", dateFrom);
      if (dateTo) q = q.lte("posted_at", dateTo);
      const { data, error } = await q;
      if (error)
        return {
          content: [{ type: "text", text: `Errore DB: ${error.message}` }],
          isError: true,
        };
      // Includi anche lo snapshot canale piu' recente cosi' Claude
      // ha contesto su subscriber_count + verified.
      const { data: chanData } = await admin
        .from("mait_youtube_channels")
        .select(
          "channel_id, channel_name, channel_username, channel_url, channel_description, is_verified, subscriber_count, total_videos, total_views, scraped_at",
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("competitor_id", brandId)
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                channel,
                channel_snapshot: chanData ?? null,
                count: (data ?? []).length,
                items: data ?? [],
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Channel '${channel}' non supportato` }],
      isError: true,
    };
  },
};
