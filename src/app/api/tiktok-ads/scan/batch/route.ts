/**
 * POST /api/tiktok-ads/scan/batch — batch multi-brand del TikTok Ads
 * DSA library (path "library", per-brand). Usa il dispatcher generico
 * con safety centralizzata (cooldown/concurrency/daily cap/charge
 * atomico). Il path Creative Center NON e' batchabile (workspace-level,
 * non per-brand) — resta solo sul single-scan.
 *
 * GET ritorna lo stato del batch (polling-friendly + auto-reconcile
 * dei job stuck).
 */
import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";
import { POST as scanPost } from "../route";

export const maxDuration = 300;

type TiktokAdsBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  tiktok_username: string | null;
};

export function POST(req: Request) {
  return dispatchAsyncBatch<TiktokAdsBrand>(req, {
    source: "tiktok_ads",
    selectFields: "id, workspace_id, page_name, tiktok_username",
    // Proxy di "presenza TikTok": evita di spendere crediti su brand
    // senza alcun segnale TikTok. Il single-scan resta libero.
    hasChannelConfig: (c) => !!c.tiktok_username,
    internalScanPath: "/api/tiktok-ads/scan",
    scanHandler: scanPost,
    // Forza il path library (per-brand). Senza questo il discriminated
    // union della scan route non saprebbe quale attore lanciare.
    buildScanBody: () => ({ source: "library" }),
    channelLabel: "TikTok Ads",
  });
}

export function GET(req: Request) {
  return getBatchStatus(req, "tiktok_ads");
}
