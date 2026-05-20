import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";
import { POST as instagramScanHandler } from "@/app/api/instagram/scan/route";

// 300s: il batch endpoint risponde subito al client, poi vive in
// after() per le ~90s necessarie a tutti gli scan paralleli.
export const maxDuration = 300;

/**
 * POST /api/instagram/scan/batch
 *
 * Batch Instagram scan multi-brand. Usa il pattern fire-and-forget
 * verso /api/instagram/scan?batched=1: il batch endpoint pre-carica
 * crediti + job rows, poi fa fetch internal con abort 3s. Le scan
 * funzioni Vercel partono e proseguono indipendenti per il loro
 * maxDuration 300s. Il batch endpoint torna in <10s.
 *
 * Safety: tutto da @/lib/apify/batch-safety (cooldown 12h, max 8
 * paralleli per workspace, daily cost cap, credit rollback atomico).
 */
type IgBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  instagram_username: string | null;
};

export async function POST(req: Request) {
  return dispatchAsyncBatch<IgBrand>(req, {
    source: "instagram",
    channelLabel: "Instagram",
    selectFields: "id, workspace_id, page_name, instagram_username",
    hasChannelConfig: (c) => !!c.instagram_username,
    internalScanPath: "/api/instagram/scan",
    scanHandler: instagramScanHandler,
    buildScanBody: (c, batch) => ({
      max_posts: batch.max_items ?? undefined,
    }),
  });
}

export async function GET(req: Request) {
  return getBatchStatus(req, "instagram");
}
