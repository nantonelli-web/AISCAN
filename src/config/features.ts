/**
 * Feature flags. Centralised so disabling a half-baked feature is one
 * file change instead of N component edits, and so re-enabling later
 * doesn't require hunting for every UI surface that references it.
 *
 * Each flag should keep a short note explaining WHY it is in its
 * current state — so a future read of the file tells the whole story.
 */

/**
 * AI Tagging surface (button to classify ads + post-classification
 * badges on cards + "AI Tags" card on the ad detail page).
 *
 * Off because the classification was largely redundant with the real
 * data Apify already gives us (sector ≈ brand category, format ≈
 * displayFormat, objective often readable from the CTA), and the
 * genuinely-new fields (tone, seasonality, language) were never
 * wired into any filter, chart or aggregation. The tags were just
 * decorative badges with a per-batch credit + OpenRouter cost.
 *
 * Flip back to true once we either (a) plumb tone/objective into
 * Library/Benchmarks filters, or (b) auto-run tagging on scan
 * completion so the user never sees the "X ads to analyze" prompt.
 *
 * Backend stays intact (`/api/ai/tag`, `/api/ai/tag/count`,
 * `lib/ai/tagger.ts`, `mait_tags` / `mait_ads_tags` tables). Only
 * the UI surfaces are hidden.
 */
export const AI_TAGS_ENABLED = false;

/**
 * Collaborazioni L3 — profile enrichment (verified / follower count /
 * bio / categoria / tier dimensionale) degli account collaboratori,
 * scrapando il profilo via Apify. Dato REALE di piattaforma, quindi
 * coerente col principio "real data only".
 *
 * On-demand: nessuno scrape parte automaticamente. L'utente clicca
 * "Analizza collaboratori" nel pannello Top Collaboratori; il costo
 * (crediti Apify) e' mostrato in preview e addebitato solo al click.
 *
 * Instagram live da subito (riusa scrapeInstagramProfile). TikTok in
 * un secondo step quando sara' scelto un actor profilo TikTok — fino
 * ad allora l'enrichment TikTok ritorna "skipped" e la UI mostra solo
 * la classificazione per quegli account.
 */
export const COLLAB_ENRICH_ENABLED = true;

/**
 * Collaborazioni L2 — classificazione AI di ogni account collaboratore
 * in brand / influencer / celebrity / staff (+ confidence).
 *
 * Gated da flag come da principio "real data only — AI classifications
 * gated by feature flag": e' un'OPINIONE del modello, non un dato di
 * piattaforma, quindi deve essere disattivabile in un punto solo.
 * Default ON perche' richiesta esplicitamente; spegnere qui nasconde
 * badge + filtri di classificazione lasciando intatto l'enrichment L3.
 *
 * Input del classificatore = handle + bio + verified + follower (i
 * campi L3): la classifica e' molto piu' affidabile DOPO l'enrichment.
 */
export const COLLAB_CLASSIFY_ENABLED = true;

/**
 * AI Relevance Check on Compare's "Latest ads" — a lightweight, on-demand
 * pass that judges whether each displayed creative actually belongs to the
 * brand's advertising universe, flagging off-brand / misattributed ones
 * (e.g. an unrelated sneaker creative surfacing for a plus-size womenswear
 * brand). It is an OPINION of the model, not platform data, so per the
 * "real data only — AI classifications gated by feature flag" principle it
 * lives behind a single switch.
 *
 * Non-destructive by design: flagged creatives are badged "possibile fuori
 * target", never silently hidden — the user keeps the call. On-demand and
 * billed (1 credit/run), so nothing fires automatically. Turning this off
 * hides the "Verifica pertinenza" button and the badges; the deterministic
 * geo + copy-language filters (lib/ads/ad-filters) stay on regardless.
 */
export const AI_RELEVANCE_CHECK_ENABLED = true;
