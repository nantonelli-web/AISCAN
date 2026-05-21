-- =====================================================================
-- 0057 — last_seen_in_scan_at su tabelle organiche
--
-- Estende il pattern di 0034 (mait_ads_external.last_seen_in_scan_at)
-- alle tabelle organiche per-canale: mait_organic_posts (Instagram),
-- mait_tiktok_posts, mait_youtube_videos.
--
-- Perche': il batch reconcile (reconcileStuckBatchJobs in
-- src/lib/apify/batch-dispatch.ts) deve capire se uno scan killato
-- dal function-timeout ha comunque salvato dati. Usare created_at NON
-- basta: una RI-scansione che ritrova solo post gia' noti fa upsert
-- senza creare righe nuove (created_at resta fermo) -> verrebbe
-- marcata erroneamente 'failed' + refund indebito. last_seen_in_scan_at
-- viene bumpato a OGNI upsert (anche sui record esistenti), quindi
-- cattura correttamente "questo scan ha toccato dati".
--
-- Gli handler scan (instagram/tiktok/youtube) settano il campo
-- nell'upsert, esattamente come fa gia' lo scan Meta.
--
-- Backfill: le righe esistenti ereditano created_at (il loro primo
-- ingresso in DB). Default now() per i nuovi insert se l'handler non
-- lo passa. Stesso identico schema di 0034.

-- ----- mait_organic_posts (Instagram) -----
alter table mait_organic_posts
  add column if not exists last_seen_in_scan_at timestamptz;

update mait_organic_posts
   set last_seen_in_scan_at = created_at
 where last_seen_in_scan_at is null;

alter table mait_organic_posts
  alter column last_seen_in_scan_at set default now(),
  alter column last_seen_in_scan_at set not null;

create index if not exists idx_mait_organic_posts_last_seen
  on mait_organic_posts (competitor_id, last_seen_in_scan_at desc);

-- ----- mait_tiktok_posts -----
alter table mait_tiktok_posts
  add column if not exists last_seen_in_scan_at timestamptz;

update mait_tiktok_posts
   set last_seen_in_scan_at = created_at
 where last_seen_in_scan_at is null;

alter table mait_tiktok_posts
  alter column last_seen_in_scan_at set default now(),
  alter column last_seen_in_scan_at set not null;

create index if not exists idx_mait_tiktok_posts_last_seen
  on mait_tiktok_posts (competitor_id, last_seen_in_scan_at desc);

-- ----- mait_youtube_videos -----
alter table mait_youtube_videos
  add column if not exists last_seen_in_scan_at timestamptz;

update mait_youtube_videos
   set last_seen_in_scan_at = created_at
 where last_seen_in_scan_at is null;

alter table mait_youtube_videos
  alter column last_seen_in_scan_at set default now(),
  alter column last_seen_in_scan_at set not null;

create index if not exists idx_mait_youtube_videos_last_seen
  on mait_youtube_videos (competitor_id, last_seen_in_scan_at desc);
