import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";

export const maxDuration = 30;

/**
 * POST /api/tiktok/scan/batch
 *
 * Batch TikTok scan multi-brand. Stesso pattern di IG batch (fire-
 * and-forget verso /api/tiktok/scan?batched=1). Vedi commento in
 * /api/instagram/scan/batch/route.ts per dettagli architetturali.
 */
type TtBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  tiktok_username: string | null;
};

export async function POST(req: Request) {
  return dispatchAsyncBatch<TtBrand>(req, {
    source: "tiktok",
    channelLabel: "TikTok",
    selectFields: "id, workspace_id, page_name, tiktok_username",
    hasChannelConfig: (c) => !!c.tiktok_username,
    internalScanPath: "/api/tiktok/scan",
    buildScanBody: (c, batch) => ({
      max_posts: batch.max_items ?? undefined,
    }),
  });
}

export async function GET(req: Request) {
  return getBatchStatus(req, "tiktok");
}
