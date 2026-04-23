import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

/**
 * DB-backed brute-force throttle for the admin login route.
 * Uses Supabase rather than an external Redis so no new infra is required.
 *
 * Call `checkRate` BEFORE verifying the password, and `recordAttempt`
 * AFTER the verdict is known.
 */
export async function checkRate(
  admin: SupabaseClient,
  { email, ip }: { email: string; ip: string | null }
): Promise<{ ok: true } | { ok: false; reason: "email_locked" | "ip_locked" }> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const [{ count: emailFails }, { count: ipFails }] = await Promise.all([
    admin
      .from("mait_admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("success", false)
      .gte("attempted_at", since),
    ip
      ? admin
          .from("mait_admin_login_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip", ip)
          .eq("success", false)
          .gte("attempted_at", since)
      : Promise.resolve({ count: 0 }),
  ]);

  if ((emailFails ?? 0) >= MAX_PER_EMAIL) return { ok: false, reason: "email_locked" };
  if ((ipFails ?? 0) >= MAX_PER_IP) return { ok: false, reason: "ip_locked" };
  return { ok: true };
}

export async function recordAttempt(
  admin: SupabaseClient,
  { email, ip, success }: { email: string; ip: string | null; success: boolean }
): Promise<void> {
  await admin.from("mait_admin_login_attempts").insert({ email, ip, success });
}
