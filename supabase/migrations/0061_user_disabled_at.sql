-- Disable users from the Admin panel without deleting them.
--
-- disabled_at NULL = active; non-null = disabled. Set alongside a Supabase
-- Auth ban by /api/admin/users (PATCH). The column lets us enforce the
-- disabled state cheaply at the app layer:
--   - getSessionUser() logs a disabled user out on the next request
--   - consumeCredits() blocks API credit spend during the ~1h window in
--     which the user's existing access token is still valid post-ban
-- The Auth ban remains the hard backstop (blocks login + token refresh).
alter table mait_users
  add column if not exists disabled_at timestamptz;
