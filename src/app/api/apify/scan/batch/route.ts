import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";

export const maxDuration = 30;

/**
 * POST /api/apify/scan/batch (Meta Ads batch)
 *
 * Batch Meta Ads scan multi-brand. Stesso pattern di IG batch. La
 * rotta per-brand vive su /api/apify/scan (legacy path) e ora
 * accetta il flag batched. Path qui mantenuto per allineamento
 * con la rotta per-brand.
 */
type MetaBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  page_id: string | null;
  page_url: string | null;
};

export async function POST(req: Request) {
  return dispatchAsyncBatch<MetaBrand>(req, {
    source: "meta",
    channelLabel: "Meta Ads",
    selectFields: "id, workspace_id, page_name, page_id, page_url",
    hasChannelConfig: (c) => !!(c.page_id || c.page_url),
    internalScanPath: "/api/apify/scan",
    buildScanBody: (c, batch) => ({
      max_items: batch.max_items ?? undefined,
    }),
  });
}

export async function GET(req: Request) {
  return getBatchStatus(req, "meta");
}
