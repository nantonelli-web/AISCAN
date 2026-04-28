-- =====================================================================
-- AISCAN — Google Maps integration
-- Class B (autonomous entity, not bound to a brand) per the brief.
--
-- Three tables:
-- 1. mait_maps_searches  — the search definition (term + location)
-- 2. mait_maps_places    — places returned by a search (denormalised
--                          per search; same place across two searches
--                          creates two rows so we can track the rank
--                          independently per search)
-- 3. mait_maps_reviews   — reviews for a specific place (extracted in
--                          the same actor run, no separate scan)
--
-- ⚠ ARCHITECTURE NOTE — single-actor strategy (2026-04-28)
-- The brief listed two actors: compass/crawler-google-places for
-- places + automation-lab/google-maps-reviews-scraper for reviews.
-- During the sanity test the latter returned 0 reviews on every
-- input we tried (Sidhe Milano, Duomo di Milano), even though the
-- log reported the FID was resolved. The actor has 113 users vs
-- 379K for compass; clearly less battle-tested. We discovered that
-- compass/crawler-google-places ALREADY exposes reviews per place
-- when invoked with `maxReviews=N` — bundled into the place item
-- under `reviews[]`. So we ship a single-actor design: one scan
-- returns places + their reviews in one go. Cheaper, more reliable,
-- richer schema (the bundled reviews carry `reviewDetailedRating`
-- like Cibo / Servizio / Ambiente that the dedicated reviews actor
-- does not).
--
-- Brand match for Maps places follows the same pattern as SERP:
-- normalize the place's website domain (eTLD+1) and JOIN at render
-- time against `mait_competitors.google_domain`. No FK.
--
-- Schema verified on 2026-04-28 against "ristoranti Milano" — see
-- `project_new_actors_plan.md`.
-- =====================================================================

-- ---------- MAPS SEARCHES ----------
create table if not exists mait_maps_searches (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,

  search_term         text not null,                  -- e.g. "ristoranti"
  location_query      text not null,                  -- e.g. "Milano, Italy"
  language            text not null default 'it',
  country_code        text not null default 'IT',
  max_places          integer not null default 20,
  max_reviews_per_place integer not null default 10,

  label               text,                           -- optional human label
  is_active           boolean not null default true,

  last_scraped_at     timestamptz,
  created_at          timestamptz not null default now()
);

-- Same expression-based UNIQUE pattern as SERP queries — Postgres
-- requires a separate index for `lower(...)` predicates.
create unique index if not exists ux_mait_maps_searches_unique
  on mait_maps_searches(workspace_id, lower(search_term), lower(location_query), language, country_code);

create index if not exists idx_mait_maps_searches_workspace
  on mait_maps_searches(workspace_id);
create index if not exists idx_mait_maps_searches_last_scraped
  on mait_maps_searches(last_scraped_at desc nulls last);

-- ---------- MAPS PLACES ----------
create table if not exists mait_maps_places (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  search_id           uuid not null references mait_maps_searches(id) on delete cascade,

  -- Identity (Google's own keys — `placeId` is the canonical one)
  place_id            text not null,
  cid                 text,                           -- decimal cid
  fid                 text,                           -- hex fid
  kgmid               text,                           -- knowledge graph id

  -- Branding / content
  title               text,
  sub_title           text,
  description         text,
  category_name       text,
  categories          text[] default '{}',
  price               text,                           -- "20-30 €"

  -- Location
  address             text,
  street              text,
  city                text,
  postal_code         text,
  state               text,
  country_code        text,
  neighborhood        text,
  location_lat        numeric,
  location_lng        numeric,
  plus_code           text,

  -- Contact
  website             text,
  -- normalized_domain: eTLD+1 of `website` (computed in the service
  -- layer). Used to JOIN against mait_competitors.google_domain so
  -- the brand-match highlight works the same way it does for SERP.
  normalized_domain   text,
  phone               text,

  -- Engagement
  total_score         numeric,                        -- 1..5 average
  reviews_count       integer default 0,
  images_count        integer default 0,
  rank                integer,                        -- 1-based position in this search
  is_advertisement    boolean default false,

  -- Status
  permanently_closed  boolean default false,
  temporarily_closed  boolean default false,

  -- Hours / structured info
  opening_hours       jsonb default '[]'::jsonb,
  additional_info    jsonb default '{}'::jsonb,
  popular_times      jsonb default '{}'::jsonb,
  popular_times_live_text     text,
  popular_times_live_percent  integer,

  -- Visuals + canonical urls
  image_url           text,
  url                 text,                           -- canonical /place/?... share URL
  search_page_url     text,                           -- the search results URL
  reserve_table_url   text,
  google_food_url     text,

  -- Hotel-specific (mostly null for non-hotel categories — kept to
  -- avoid a separate table for what the actor returns flat).
  hotel_stars         integer,
  hotel_description   text,

  scraped_at          timestamptz not null default now(),
  raw_data            jsonb,

  unique (workspace_id, search_id, place_id)
);

create index if not exists idx_mait_maps_places_workspace
  on mait_maps_places(workspace_id);
create index if not exists idx_mait_maps_places_search
  on mait_maps_places(search_id);
create index if not exists idx_mait_maps_places_domain
  on mait_maps_places(normalized_domain);
create index if not exists idx_mait_maps_places_rank
  on mait_maps_places(rank);

-- ---------- MAPS REVIEWS ----------
create table if not exists mait_maps_reviews (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  -- FK to the AISCAN place row, NOT to Google's place_id directly,
  -- so cascading delete of a search wipes its reviews automatically.
  place_id            uuid not null references mait_maps_places(id) on delete cascade,

  -- Google's review identifier (stable across re-scans).
  review_id           text not null,
  review_url          text,

  -- Content
  text                text,
  text_translated     text,
  stars               integer,
  -- The actor exposes per-aspect ratings (Cibo / Servizio / Ambiente
  -- on restaurants; Camera / Posizione on hotels) under
  -- `reviewDetailedRating`. JSONB so the schema doesn't need to
  -- enumerate every category.
  detailed_ratings    jsonb default '{}'::jsonb,
  -- And `reviewContext` (Prezzo, Tempo di attesa, Dimensione gruppo,
  -- Allergie, …) — all key/value strings.
  context             jsonb default '{}'::jsonb,
  likes_count         integer default 0,
  language            text,                           -- originalLanguage
  translated_language text,
  review_image_urls   text[] default '{}',

  -- Reviewer
  reviewer_name       text,
  reviewer_url        text,
  reviewer_id         text,
  reviewer_photo_url  text,
  reviewer_review_count integer,
  is_local_guide      boolean default false,

  -- Owner response (often the most informative signal for brands).
  response_from_owner_text text,
  response_from_owner_date timestamptz,

  -- Optional sentiment (only when AI analysis is enabled — null
  -- otherwise, we don't fabricate).
  sentiment           text,                           -- "positive" | "negative" | "neutral" | "mixed"
  sentiment_score     numeric,                        -- 0..1
  topics              text[] default '{}',

  -- Timing
  published_at        timestamptz,                    -- publishedAtDate (ISO)
  publish_at_text     text,                           -- "2 settimane fa"
  last_edited_at      timestamptz,
  scraped_at          timestamptz not null default now(),

  raw_data            jsonb,

  unique (workspace_id, place_id, review_id)
);

create index if not exists idx_mait_maps_reviews_workspace
  on mait_maps_reviews(workspace_id);
create index if not exists idx_mait_maps_reviews_place
  on mait_maps_reviews(place_id);
create index if not exists idx_mait_maps_reviews_published
  on mait_maps_reviews(published_at desc nulls last);
create index if not exists idx_mait_maps_reviews_stars
  on mait_maps_reviews(stars);

-- ---------- RLS ----------
alter table mait_maps_searches enable row level security;
alter table mait_maps_places   enable row level security;
alter table mait_maps_reviews  enable row level security;

drop policy if exists "maps_searches_select" on mait_maps_searches;
create policy "maps_searches_select" on mait_maps_searches for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "maps_searches_write" on mait_maps_searches;
create policy "maps_searches_write" on mait_maps_searches for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

drop policy if exists "maps_places_select" on mait_maps_places;
create policy "maps_places_select" on mait_maps_places for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "maps_places_write" on mait_maps_places;
create policy "maps_places_write" on mait_maps_places for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

drop policy if exists "maps_reviews_select" on mait_maps_reviews;
create policy "maps_reviews_select" on mait_maps_reviews for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "maps_reviews_write" on mait_maps_reviews;
create policy "maps_reviews_write" on mait_maps_reviews for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

-- ---------- Grants ----------
grant all on mait_maps_searches to anon, authenticated, service_role;
grant all on mait_maps_places   to anon, authenticated, service_role;
grant all on mait_maps_reviews  to anon, authenticated, service_role;
