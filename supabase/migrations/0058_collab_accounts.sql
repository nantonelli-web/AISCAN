-- 0058_collab_accounts.sql
--
-- Collaborazioni Livello 2 + Livello 3.
--
-- L1 (gia' live) estrae i collaboratori dai post organici IG/TikTok
-- (tagged_users + mentions ≠ brand) e li aggrega per frequenza —
-- vedi src/lib/organic/collaborations.ts. Resta "solo handle +
-- count": nessuna idea se @tizio sia un influencer, un altro brand,
-- una celebrity o lo staff, ne' quanto e' grande.
--
-- Questa tabella aggiunge i due livelli mancanti, in UN'unica riga
-- per (workspace, handle, piattaforma):
--   L3 enrichment (DATO REALE di piattaforma): verified, follower
--     count, bio, categoria, tier dimensionale. Per Instagram via
--     apify/instagram-scraper (scrapeInstagramProfile, gia' usato per
--     il profilo brand). TikTok arrivera' dopo (actor profilo da
--     scegliere) — le colonne sono channel-agnostic, nessuna nuova
--     migration servira'.
--   L2 classification (OPINIONE AI, dietro feature flag come da
--     principio "real data only"): brand / influencer / celebrity /
--     staff. Input = handle + bio + verified + follower (cioe' i
--     campi L3): la classificazione e' molto piu' affidabile DOPO
--     l'enrichment, per questo i due vivono nella stessa riga.
--
-- Scope workspace, NON brand: lo stesso influencer taggato da due
-- brand dello stesso workspace e' la stessa persona → cache condivisa,
-- si arricchisce/classifica una volta sola. La frequenza per-brand
-- resta calcolata al volo da L1 sui post; qui teniamo solo l'identita'
-- dell'account.
--
-- Crescita: ~#account distinti taggati per workspace (ordine
-- centinaia), enrich/classify on-demand. Trascurabile.

create table mait_collab_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  -- Handle normalizzato (no @, lowercase, no trailing punctuation) —
  -- stessa normalizzazione di normalizeHandle() lato app, cosi' il
  -- match con gli aggregati L1 e' 1:1.
  handle text not null,
  platform text not null check (platform in ('instagram', 'tiktok')),

  -- ── L3 enrichment (dato reale di piattaforma) ──
  full_name text,
  biography text,
  category text,                         -- businessCategoryName (IG)
  verified boolean,
  followers_count bigint,
  -- Tier dimensionale derivato dai follower al momento dell'enrichment.
  -- Soglie standard influencer marketing:
  --   nano  < 10k | mid 10k–100k | macro 100k–1M | mega ≥ 1M
  -- Ricalcolato a ogni enrichment (i follower cambiano lento).
  tier text check (tier in ('nano', 'mid', 'macro', 'mega')),
  profile_pic_url text,
  external_url text,
  enriched_at timestamptz,
  -- 'ok' (profilo trovato) | 'not_found' (account inesistente/privato
  -- senza dati) | 'error' (actor fallito). Distinto da enriched_at
  -- null (= mai tentato) per non ri-tentare in loop i not_found.
  enrich_status text check (enrich_status in ('ok', 'not_found', 'error')),
  enrich_error text,
  raw_profile jsonb,

  -- ── L2 classification (opinione AI, dietro feature flag) ──
  classification text check (
    classification in ('brand', 'influencer', 'celebrity', 'staff', 'unknown')
  ),
  classification_confidence numeric,     -- 0..1
  classification_reason text,            -- breve motivazione del modello
  classification_model_tier text,        -- cheap | pragmatic | premium
  classification_model_id text,          -- es. anthropic/claude-haiku-4.5
  classified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una sola riga per account+piattaforma nel workspace. L'upsert
  -- enrichment/classify usa questo conflict target.
  unique (workspace_id, handle, platform)
);

-- Lookup principale: "dammi le righe cache per questi handle di un
-- workspace su una piattaforma" (la GET /collab-accounts passa la
-- lista di handle dal pannello).
create index idx_collab_accounts_lookup
  on mait_collab_accounts (workspace_id, platform, handle);

-- Filtro per classificazione (UI "Solo influencer" / "Solo brand").
create index idx_collab_accounts_classification
  on mait_collab_accounts (workspace_id, classification);

-- RLS — stesso pattern delle altre mait_* tables. Le scritture
-- passano dall'admin client (service role, bypassa RLS); la GET
-- legge col client utente, quindi serve almeno la select policy.
alter table mait_collab_accounts enable row level security;

create policy "collab_accounts_workspace_read"
  on mait_collab_accounts for select
  using (workspace_id in (
    select workspace_id from mait_users where id = auth.uid()
  ));

create policy "collab_accounts_workspace_insert"
  on mait_collab_accounts for insert
  with check (workspace_id in (
    select workspace_id from mait_users where id = auth.uid()
  ));

create policy "collab_accounts_workspace_update"
  on mait_collab_accounts for update
  using (workspace_id in (
    select workspace_id from mait_users where id = auth.uid()
  ));
