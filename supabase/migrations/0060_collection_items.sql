-- 0060_collection_items.sql
--
-- Collections polimorfiche: una collection puo' contenere QUALSIASI
-- creativita' (ads Meta/Google/TikTok/Snapchat + organic IG/TikTok/
-- Snapchat/YouTube), non piu' solo ads di mait_ads_external.
--
-- Prima: mait_collection_ads(collection_id, ad_id → mait_ads_external).
-- Limite: la FK a tabella singola impediva di salvare creativita' di
-- altri canali. Ora: legame polimorfico (item_type, item_id) — niente
-- FK singola, la validazione "esiste + workspace" la fa la API per
-- tipo (vedi src/lib/collections/item-types.ts).
--
-- mait_collection_ads resta in piedi (non droppata) per sicurezza: i
-- suoi dati vengono migrati qui sotto come item_type='ad'. Il codice
-- passa a leggere/scrivere mait_collection_items.

create table if not exists mait_collection_items (
  id            uuid primary key default uuid_generate_v4(),
  collection_id uuid not null references mait_collections(id) on delete cascade,
  -- Allineato a CollectionItemType in src/lib/collections/item-types.ts.
  item_type     text not null check (item_type in (
    'ad', 'tiktok_ad', 'snapchat_ad',
    'instagram_post', 'tiktok_post', 'snapchat_profile', 'youtube_video'
  )),
  -- `id` (uuid) della riga nella tabella del tipo. Polimorfico: niente
  -- FK (i tipi puntano a tabelle diverse). on delete della riga sorgente
  -- non cascada qui — un cleanup periodico o la render-time guard
  -- gestiscono gli item orfani (la detail page semplicemente non
  -- renderizza una riga sorgente mancante).
  item_id       uuid not null,
  created_at    timestamptz not null default now(),
  unique (collection_id, item_type, item_id)
);

create index if not exists idx_collection_items_collection
  on mait_collection_items (collection_id);

-- Backfill: porta gli ads gia' salvati nel nuovo modello come 'ad'.
insert into mait_collection_items (collection_id, item_type, item_id)
select collection_id, 'ad', ad_id
from mait_collection_ads
on conflict (collection_id, item_type, item_id) do nothing;

-- RLS — stesso pattern di mait_collections (accesso via collection del
-- workspace corrente). Le scritture dell'app passano dall'admin client
-- (service role, bypassa RLS); la select policy copre eventuali letture
-- col client utente.
alter table mait_collection_items enable row level security;

create policy "collection_items_select" on mait_collection_items for select
  using (
    collection_id in (
      select id from mait_collections
      where workspace_id = mait_current_workspace()
    )
  );

create policy "collection_items_write" on mait_collection_items for all
  using (
    collection_id in (
      select id from mait_collections
      where workspace_id = mait_current_workspace()
    )
  )
  with check (
    collection_id in (
      select id from mait_collections
      where workspace_id = mait_current_workspace()
    )
  );
