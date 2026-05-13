import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeOrganicBenchmarks,
  computeTiktokBenchmarks,
} from "@/lib/analytics/benchmarks";
import type { McpTool } from "../types";

/**
 * Tool sul canale ORGANIC (Instagram, Facebook, TikTok, YouTube).
 * Scoped al workspace OAuth via ctx.workspaceId, mai cross-workspace.
 *
 * Distinto dai tool paid (brand/ads/benchmarks/perf) perche' AISCAN
 * persiste l'organic in tabelle dedicate per channel:
 *   - mait_organic_posts (IG + Facebook)
 *   - mait_tiktok_posts
 *   - mait_youtube_channels (snapshot) + mait_youtube_videos
 */

interface OrganicPostRow {
  id: string;
  competitor_id: string | null;
  platform: string | null;
  post_id: string | null;
  post_url: string | null;
  post_type: string | null;
  caption: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_views: number | null;
  shares_count: number | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  tagged_users: string[] | null;
  posted_at: string | null;
}

interface TiktokPostRow {
  id: string;
  competitor_id: string | null;
  post_id: string | null;
  post_url: string | null;
  caption: string | null;
  duration_seconds: number | null;
  is_slideshow: boolean | null;
  play_count: number | null;
  digg_count: number | null;
  share_count: number | null;
  comment_count: number | null;
  collect_count: number | null;
  music_name: string | null;
  music_author: string | null;
  music_original: boolean | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  posted_at: string | null;
}

interface YoutubeChannelRow {
  id: string;
  competitor_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_url: string | null;
  channel_username: string | null;
  channel_description: string | null;
  is_verified: boolean | null;
  subscriber_count: number | null;
  total_videos: number | null;
  total_views: number | null;
  scraped_at: string | null;
}

interface YoutubeVideoRow {
  id: string;
  competitor_id: string | null;
  video_id: string | null;
  video_url: string | null;
  title: string | null;
  description: string | null;
  type: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
  posted_relative: string | null;
}

export const listOrganicPostsTool: McpTool = {
  definition: {
    name: "list_organic_posts",
    description:
      "Lista i post organic Instagram/Facebook salvati per un brand. Include caption, hashtag, menzioni, likes/comments/views, post_type (Image/Video/Reel/Sidecar), e timestamp. Per TikTok usa list_tiktok_posts. Per YouTube usa list_youtube_videos.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: {
          type: "string",
          format: "uuid",
          description: "UUID del brand (da list_brands).",
        },
        platform: {
          type: "string",
          enum: ["instagram", "facebook"],
          description: "Filtra per piattaforma. Default: entrambi.",
        },
        post_type: {
          type: "string",
          enum: ["Image", "Video", "Reel", "Sidecar"],
          description: "Filtra per tipo di post.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Default 20. Ordinati per posted_at DESC.",
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
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const admin = createAdminClient();
    let q = admin
      .from("mait_organic_posts")
      .select(
        "id, competitor_id, platform, post_id, post_url, post_type, caption, likes_count, comments_count, video_views, shares_count, hashtags, mentions, tagged_users, posted_at",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (typeof args.platform === "string") q = q.eq("platform", args.platform);
    if (typeof args.post_type === "string")
      q = q.eq("post_type", args.post_type);
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as OrganicPostRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Nessun post organic IG/FB in DB per questo brand con i filtri specificati.",
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  },
};

export const listTiktokPostsTool: McpTool = {
  definition: {
    name: "list_tiktok_posts",
    description:
      "Lista i post TikTok organic di un brand. Include caption, hashtag, menzioni, metriche TikTok (play_count=views, digg_count=likes, share_count, comment_count, collect_count=saves), durata video, info audio (music_name/author, music_original=true se audio originale, false se trending).",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string", format: "uuid" },
        is_slideshow: {
          type: "boolean",
          description:
            "Se true → solo slideshow. Se false → solo video. Default: entrambi.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["brand_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const brandId = String(args.brand_id ?? "").trim();
    const limit = typeof args.limit === "number" ? args.limit : 20;
    if (!brandId) {
      return {
        content: [{ type: "text", text: "brand_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    let q = admin
      .from("mait_tiktok_posts")
      .select(
        "id, competitor_id, post_id, post_url, caption, duration_seconds, is_slideshow, play_count, digg_count, share_count, comment_count, collect_count, music_name, music_author, music_original, hashtags, mentions, posted_at",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (typeof args.is_slideshow === "boolean")
      q = q.eq("is_slideshow", args.is_slideshow);
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as TiktokPostRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          { type: "text", text: "Nessun post TikTok in DB per questo brand." },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  },
};

export const getYoutubeChannelTool: McpTool = {
  definition: {
    name: "get_youtube_channel",
    description:
      "Ritorna lo snapshot più recente del canale YouTube di un brand: subscriber_count, total_videos, total_views, descrizione del canale, verified flag, link sociali nella descrizione. Per i singoli video usa list_youtube_videos.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string", format: "uuid" },
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
    const { data } = await admin
      .from("mait_youtube_channels")
      .select(
        "id, competitor_id, channel_id, channel_name, channel_url, channel_username, channel_description, is_verified, subscriber_count, total_videos, total_views, scraped_at",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as YoutubeChannelRow | null;
    if (!row) {
      return {
        content: [
          {
            type: "text",
            text: "Nessun canale YouTube in DB per questo brand. Lancia uno scan YouTube dalla pagina brand.",
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
    };
  },
};

export const listYoutubeVideosTool: McpTool = {
  definition: {
    name: "list_youtube_videos",
    description:
      "Lista i video YouTube di un brand. Include title, description (se actor configurato con video_details=true, altrimenti null), view_count, like_count, comment_count, type (video/short/stream), duration_seconds, posted_at + posted_relative (es. '1 month ago' originale).",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string", format: "uuid" },
        type: {
          type: "string",
          enum: ["video", "short", "stream"],
          description: "Filtra per tipo. Default: tutti.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["brand_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const brandId = String(args.brand_id ?? "").trim();
    const limit = typeof args.limit === "number" ? args.limit : 30;
    if (!brandId) {
      return {
        content: [{ type: "text", text: "brand_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    let q = admin
      .from("mait_youtube_videos")
      .select(
        "id, competitor_id, video_id, video_url, title, description, type, duration_seconds, view_count, like_count, comment_count, posted_at, posted_relative",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (typeof args.type === "string") q = q.eq("type", args.type);
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as YoutubeVideoRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Nessun video YouTube in DB per questo brand.",
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  },
};

export const getOrganicBenchmarksTool: McpTool = {
  definition: {
    name: "get_organic_benchmarks",
    description:
      "Aggregato cross-brand del canale organic Instagram: volume post per brand, format mix, top hashtag globali + per brand, avg likes/comments/views, post per settimana, reel duration distribution, audio strategy (originale vs trending), collaboration rate. Stessi dati della pagina Benchmarks → Instagram organic.",
    inputSchema: {
      type: "object",
      properties: {
        brand_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
        },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const admin = createAdminClient();
    const data = await computeOrganicBenchmarks(
      admin,
      ctx.workspaceId,
      Array.isArray(args.brand_ids)
        ? (args.brand_ids as string[]).filter(Boolean)
        : undefined,
      typeof args.date_from === "string" ? args.date_from : undefined,
      typeof args.date_to === "string" ? args.date_to : undefined,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
};

export const getTiktokBenchmarksTool: McpTool = {
  definition: {
    name: "get_tiktok_benchmarks",
    description:
      "Aggregato cross-brand del canale organic TikTok: volume post, format split (video vs slideshow), top hashtag, avg plays/likes/shares/comments, post per settimana, distribuzione durata video, audio strategy (originale vs trending), collaboration rate. Stessi dati della pagina Benchmarks → TikTok.",
    inputSchema: {
      type: "object",
      properties: {
        brand_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
        },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const admin = createAdminClient();
    const data = await computeTiktokBenchmarks(
      admin,
      ctx.workspaceId,
      Array.isArray(args.brand_ids)
        ? (args.brand_ids as string[]).filter(Boolean)
        : undefined,
      typeof args.date_from === "string" ? args.date_from : undefined,
      typeof args.date_to === "string" ? args.date_to : undefined,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
};
