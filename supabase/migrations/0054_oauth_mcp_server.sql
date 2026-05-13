-- =====================================================================
-- AISCAN — OAuth 2.1 server per MCP (2026-05-13)
--
-- Tre tabelle per supportare lo standard OAuth 2.1 + Dynamic Client
-- Registration richiesto dal protocollo MCP:
--
--   mait_oauth_clients         — app che si vogliono connettere
--                                (Claude Desktop, Cursor, ChatGPT, ...)
--   mait_oauth_authorizations  — codici temporanei post-consenso utente
--                                (TTL ~10 min, single-use)
--   mait_oauth_tokens          — access_token + refresh_token attivi
--
-- Tutti i token sono memorizzati HASHATI (SHA-256) come per le altre
-- credenziali del progetto: il valore in chiaro esiste solo all'atto
-- della consegna al client, dopo non esiste piu' nemmeno per noi.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ─── Clients ─────────────────────────────────────────────────────────
create table if not exists mait_oauth_clients (
  id                            uuid primary key default uuid_generate_v4(),
  -- ID pubblico, mostrato al client. Generato da noi al register/seed.
  -- Per i client dinamici (Dynamic Client Registration MCP) usiamo un
  -- prefisso 'dyn_' cosi' si distinguono nei log.
  client_id                     text not null unique,
  -- Hash del client_secret per i confidential clients. NULL per i
  -- public clients (Claude Desktop con PKCE).
  client_secret_hash            text,
  -- Display name mostrato all'utente nella pagina di consenso
  -- ("Claude Desktop vuole accedere ai tuoi dati AISCAN…").
  client_name                   text not null,
  -- URI di redirect autorizzate. Validate strettamente al /authorize.
  redirect_uris                 text[] not null default '{}',
  -- Grant types supportati dal client. V1: 'authorization_code',
  -- 'refresh_token'.
  grant_types                   text[] not null default array['authorization_code','refresh_token'],
  -- Response types: V1 solo 'code'.
  response_types                text[] not null default array['code'],
  -- 'none' = public client (PKCE obbligatorio).
  -- 'client_secret_basic' = confidential client (HTTP Basic).
  token_endpoint_auth_method    text not null default 'none',
  -- Scope autorizzati su questo client. V1: 'read'. Espandibile a
  -- 'write' / 'admin' in futuro senza migration.
  scopes                        text[] not null default array['read'],
  -- True se il client e' stato registrato via /api/oauth/register
  -- (DCR). False = registrato manualmente da un admin o seed.
  is_dynamic                    boolean not null default false,
  -- Per i client dinamici creati dall'utente in /settings, traccia
  -- chi li ha creati. NULL per i client DCR (l'utente non esiste
  -- ancora al momento della registrazione MCP).
  created_by                    uuid references mait_users(id) on delete set null,
  created_at                    timestamptz not null default now()
);

create index if not exists idx_mait_oauth_clients_client_id
  on mait_oauth_clients(client_id);

-- ─── Authorization codes (post-consent, pre-token) ────────────────────
create table if not exists mait_oauth_authorizations (
  -- Hash del codice. Il codice in chiaro esiste solo nella response
  -- 302 al client durante /authorize → non lo persistiamo MAI.
  code_hash                     text primary key,
  client_id                     text not null references mait_oauth_clients(client_id) on delete cascade,
  -- L'utente AISCAN che ha autorizzato il client. Quando il client
  -- chiamera' /api/mcp con il token, noi useremo questo user_id per
  -- risolvere il workspace e applicare i suoi diritti.
  user_id                       uuid not null references mait_users(id) on delete cascade,
  workspace_id                  uuid not null references mait_workspaces(id) on delete cascade,
  -- L'URI che il client ha dichiarato a /authorize. /token deve
  -- riceverla identica per il binding.
  redirect_uri                  text not null,
  -- Scope effettivamente concessi (sottoinsieme di mait_oauth_clients.scopes).
  scopes                        text[] not null default array['read'],
  -- PKCE: code_challenge dichiarato a /authorize, verificato a /token
  -- contro il code_verifier inviato dal client.
  code_challenge                text not null,
  code_challenge_method         text not null default 'S256'
    check (code_challenge_method in ('S256','plain')),
  -- TTL breve: il codice e' single-use e dev'essere scambiato per un
  -- token entro ~10 min. Dopo expires_at viene rifiutato.
  expires_at                    timestamptz not null,
  -- Quando il codice e' stato scambiato per un token. Single-use:
  -- ogni tentativo successivo con lo stesso codice DEVE essere
  -- rifiutato (rimborso anti-replay).
  used_at                       timestamptz,
  created_at                    timestamptz not null default now()
);

create index if not exists idx_mait_oauth_auth_expires
  on mait_oauth_authorizations(expires_at);

-- ─── Tokens (access + refresh, attivi) ────────────────────────────────
create table if not exists mait_oauth_tokens (
  id                            uuid primary key default uuid_generate_v4(),
  -- Hash dell'access_token. Il valore in chiaro esiste solo nella
  -- response /token al client.
  access_token_hash             text not null unique,
  -- Hash del refresh_token. NULL se il grant non emette refresh
  -- (es. authorization_code senza offline_access scope).
  refresh_token_hash            text unique,
  client_id                     text not null references mait_oauth_clients(client_id) on delete cascade,
  user_id                       uuid not null references mait_users(id) on delete cascade,
  workspace_id                  uuid not null references mait_workspaces(id) on delete cascade,
  scopes                        text[] not null default array['read'],
  -- access_token TTL ~1h. Il client deve refreshare con refresh_token.
  access_token_expires_at       timestamptz not null,
  -- refresh_token TTL ~90gg. Quando scade l'utente deve riautorizzare.
  refresh_token_expires_at      timestamptz,
  -- Revoca via /settings/mcp o via /oauth/revoke (RFC 7009).
  revoked_at                    timestamptz,
  -- Aggiornato ad ogni hit /api/mcp per audit + cleanup di token
  -- inattivi.
  last_used_at                  timestamptz,
  created_at                    timestamptz not null default now()
);

create index if not exists idx_mait_oauth_tokens_access_hash
  on mait_oauth_tokens(access_token_hash)
  where revoked_at is null;
create index if not exists idx_mait_oauth_tokens_refresh_hash
  on mait_oauth_tokens(refresh_token_hash)
  where revoked_at is null;
create index if not exists idx_mait_oauth_tokens_user
  on mait_oauth_tokens(user_id)
  where revoked_at is null;
create index if not exists idx_mait_oauth_tokens_expires
  on mait_oauth_tokens(access_token_expires_at)
  where revoked_at is null;

-- ─── RLS ──────────────────────────────────────────────────────────────
-- Tabelle tutte admin-only: ogni endpoint OAuth + MCP usa
-- createAdminClient() (service role key, bypassa RLS).
-- Abilitiamo RLS senza policy = nessun accesso anon/authenticated key.
alter table mait_oauth_clients         enable row level security;
alter table mait_oauth_authorizations  enable row level security;
alter table mait_oauth_tokens          enable row level security;

-- ─── Comment & ownership ──────────────────────────────────────────────
comment on table mait_oauth_clients is
  'OAuth 2.1 clients registered for MCP (Claude Desktop, Cursor, …). One row per app, populated via DCR endpoint or admin seed.';
comment on table mait_oauth_authorizations is
  'Single-use authorization codes after user consent. TTL ~10min. Exchanged for tokens via /api/oauth/token.';
comment on table mait_oauth_tokens is
  'Active OAuth access + refresh tokens. All hashed (SHA-256). Validated on every /api/mcp call.';
