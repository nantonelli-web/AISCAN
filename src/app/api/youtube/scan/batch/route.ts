import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";

export const maxDuration = 30;

/**
 * POST /api/youtube/scan/batch
 *
 * Batch YouTube scan multi-brand. Stesso pattern di IG batch.
 */
type YtBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  youtube_channel_url: string | null;
};

export async function POST(req: Request) {
  return dispatchAsyncBatch<YtBrand>(req, {
    source: "youtube",
    channelLabel: "YouTube",
    selectFields: "id, workspace_id, page_name, youtube_channel_url",
    hasChannelConfig: (c) => !!c.youtube_channel_url,
    internalScanPath: "/api/youtube/scan",
    buildScanBody: (c, batch) => ({
      max_videos: batch.max_items ?? undefined,
    }),
  });
}

export async function GET(req: Request) {
  return getBatchStatus(req, "youtube");
}
