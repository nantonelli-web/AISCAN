<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:supabase-migrations -->
# Supabase migrations

Files live in `supabase/migrations/<NNNN>_<name>.sql`. The numeric prefix increments monotonically. Migrations are applied manually in the Supabase SQL editor — paste the SQL into chat AND save the file. Shared dev/prod DB: applying = live everywhere.

From **2026-10-30** the Supabase Data API stops auto-granting access to new tables in `public` on existing projects (we're on an existing project). Every new `create table` in `public` MUST include the grant + RLS block from `supabase/migrations/_TEMPLATE_new_table.sql`. Without it even the service-role admin client gets `42501 permission denied`. Existing tables already have grants and are unaffected; do NOT retroactively patch past migrations.
<!-- END:supabase-migrations -->
