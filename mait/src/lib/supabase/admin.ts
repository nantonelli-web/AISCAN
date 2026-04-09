import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. NEVER import in client components.
 * Bypasses RLS — use only in trusted server contexts (Route Handlers, Server Actions, Cron).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
