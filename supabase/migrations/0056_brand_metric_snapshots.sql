-- 0056_brand_metric_snapshots.sql
--
-- Storico snapshot metrics per brand su canali organici.
-- Risolve: confronto period-vs-period sui follower / subscriber /
-- count_posts a livello profilo. La tabella mait_competitors tiene
-- solo l'ULTIMO snapshot (instagram_profile JSONB sovrascritto a
-- ogni scan), perdendo la storia → impossibile delta follower vs
-- 30 giorni fa. Questa tabella accumula snapshot a ogni scan
-- (Instagram / TikTok / Snapchat / YouTube), una riga per scan.
--
-- Cresce lineare con #scan: ~10 brand × 4 canali × ~daily scan
-- = ~40/giorno. Trascurabile sul DB share.
--
-- Lookup pattern: "snapshot piu' recente per (brand, channel)
-- prima di X data" → indice su (competitor_id, channel,
-- scraped_at desc).

create table mait_brand_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id uuid not null references mait_competitors(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'tiktok', 'snapchat', 'youtube')),
  -- Metriche profilo. Tutte nullable: non ogni canale espone ogni
  -- campo. Es: Instagram ha followers/follows/posts; TikTok ha
  -- followers/likes_total/videos; YouTube ha subscribers/videos/
  -- views_total. Mappa puntuale nei route di scan corrispondenti.
  followers_count int,
  follows_count int,
  posts_count int,
  videos_count int,
  views_count bigint,
  likes_count bigint,
  -- Dump del payload originale per future estensioni senza nuova
  -- migration (es. engagement rate, bio length, ecc).
  raw_metrics jsonb,
  scraped_at timestamptz not null default now()
);

-- Indice di lookup principale: "ultimo snapshot prima di X" per
-- un brand+canale. La query useremo e':
--   select * from mait_brand_metric_snapshots
--   where competitor_id = $1 and channel = $2 and scraped_at <= $3
--   order by scraped_at desc limit 1
create index idx_brand_metric_snapshots_lookup
  on mait_brand_metric_snapshots (competitor_id, channel, scraped_at desc);

-- Workspace lookup (per query aggregate / pulizia per workspace).
create index idx_brand_metric_snapshots_workspace
  on mait_brand_metric_snapshots (workspace_id, scraped_at desc);

-- RLS — stesso pattern delle altre mait_* tables.
alter table mait_brand_metric_snapshots enable row level security;

create policy "brand_metric_snapshots_workspace_read"
  on mait_brand_metric_snapshots for select
  using (workspace_id in (
    select workspace_id from mait_users where id = auth.uid()
  ));

create policy "brand_metric_snapshots_workspace_insert"
  on mait_brand_metric_snapshots for insert
  with check (workspace_id in (
    select workspace_id from mait_users where id = auth.uid()
  ));

-- Backfill iniziale: per ogni brand con instagram_profile gia'
-- popolato, scrivi UN snapshot da quello. Cosi il confronto puo'
-- partire subito con almeno un punto storico (la data sara'
-- l'updated_at del brand, non quando lo scan e' avvenuto, ma
-- e' la miglior stima che abbiamo).
insert into mait_brand_metric_snapshots
  (workspace_id, competitor_id, channel,
   followers_count, follows_count, posts_count, raw_metrics, scraped_at)
select
  workspace_id,
  id as competitor_id,
  'instagram' as channel,
  (instagram_profile->>'followersCount')::int as followers_count,
  (instagram_profile->>'followsCount')::int as follows_count,
  (instagram_profile->>'postsCount')::int as posts_count,
  instagram_profile as raw_metrics,
  coalesce(last_scraped_at, now()) as scraped_at
from mait_competitors
where instagram_profile is not null
  and instagram_profile ? 'followersCount';
