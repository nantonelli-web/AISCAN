"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * If the page loads with ?code=... (Supabase OAuth redirect to Site URL),
 * forward to /api/auth/callback to exchange the code for a session.
 */
export function OAuthCodeHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code");

  useEffect(() => {
    if (code) {
      router.replace(`/api/auth/callback?code=${code}`);
    }
  }, [code, router]);

  return null;
}
