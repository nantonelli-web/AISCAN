-- 0059_collab_accounts_counts.sql
--
-- Collaboratori L3: aggiunge n. post pubblicati + n. account seguiti
-- (following) alla card profilo. Sono KPI "a costo zero": arrivano
-- dallo stesso scrape profilo IG gia' usato per follower/bio, quindi
-- nessuna chiamata Apify aggiuntiva.
--
-- Backfill immediato dal raw_profile: enrichCollaborators salva l'intero
-- InstagramProfile in raw_profile (jsonb), che contiene gia'
-- postsCount / followsCount. Popoliamo le righe esistenti senza dover
-- ri-arricchire.

alter table mait_collab_accounts
  add column if not exists posts_count int,
  add column if not exists follows_count int;

-- Backfill dalle righe gia' arricchite (raw_profile presente).
-- nullif(...,'') evita errori di cast su stringhe vuote.
update mait_collab_accounts
set
  posts_count = nullif(raw_profile->>'postsCount', '')::int,
  follows_count = nullif(raw_profile->>'followsCount', '')::int
where raw_profile is not null
  and (posts_count is null or follows_count is null);
