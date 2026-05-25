/**
 * POST /api/snapchat-ads/scan/batch — batch multi-brand della Snapchat
 * Ads Library (REST API Snap, per-brand). Usa il dispatcher generico
 * con safety centralizzata (cooldown/concurrency/daily cap/charge
 * atomico). Lo scan e' veloce (REST, niente Apify) ma passa comunque
 * dal dispatcher async per riusare reconcile/recovery uniformi.
 *
 * GET ritorna lo stato del batch (polling-friendly + auto-reconcile).
 */
import {
  dispatchAsyncBatch,
  getBatchStatus,
} from "@/lib/apify/batch-dispatch";
import { POST as scanPost } from "../route";

export const maxDuration = 300;

type SnapchatAdsBrand = {
  id: string;
  workspace_id: string;
  page_name: string | null;
  snapchat_handle: string | null;
};

export function POST(req: Request) {
  return dispatchAsyncBatch<SnapchatAdsBrand>(req, {
    source: "snapchat_ads",
    selectFields: "id, workspace_id, page_name, snapchat_handle",
    // Proxy di "presenza Snapchat": la ricerca e' per nome brand, ma
    // limitiamo il batch ai brand con un handle Snapchat noto per non
    // bruciare crediti su brand chiaramente senza presenza Snap.
    hasChannelConfig: (c) => !!c.snapchat_handle,
    internalScanPath: "/api/snapchat-ads/scan",
    scanHandler: scanPost,
    channelLabel: "Snapchat Ads",
  });
}

export function GET(req: Request) {
  return getBatchStatus(req, "snapchat_ads");
}
