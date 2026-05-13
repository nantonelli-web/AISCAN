-- =====================================================================
-- AISCAN — Sub-brand attribution rules (2026-05-13)
--
-- Alcuni brand non hanno un dominio proprio e le loro campagne ads
-- finiscono nel pool di un brand "parent" che condivide il dominio.
-- Esempio storico: Persona usa marinarinaldi.com → scan Google di
-- Marina Rinaldi raccoglie anche le ads Persona.
--
-- Soluzione: definiamo un campo `attribution_url_patterns` (regex
-- array) su ogni sub-brand + un puntatore `parent_brand_id` al brand
-- da cui claim-are le ads. Dopo ogni scan Google del parent, uno
-- splitter (in finalizeGoogleAdsScan + reconcile) ri-assegna le ads
-- matched al sub-brand giusto.
-- =====================================================================

alter table mait_competitors
  add column if not exists parent_brand_id uuid
    references mait_competitors(id) on delete set null;

alter table mait_competitors
  add column if not exists attribution_url_patterns text[];

-- Index per il lookup "dato un parent, trovami tutti i sub-brand
-- che ne reclamano le ads"
create index if not exists idx_mait_competitors_parent_brand
  on mait_competitors(parent_brand_id)
  where parent_brand_id is not null;

comment on column mait_competitors.parent_brand_id is
  'Quando questo brand e un sub-brand (es. Persona) senza dominio proprio, punta al brand parent (es. Marina Rinaldi) da cui claim-are le ads dopo lo scan.';
comment on column mait_competitors.attribution_url_patterns is
  'Array di regex POSIX case-insensitive applicati a landing_url delle ads del parent_brand_id. Le ads matched vengono riassegnate a questo competitor_id dopo lo scan. Esempio Persona: array[''/persona([/?-]|$)''].';
