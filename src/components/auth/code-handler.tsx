"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * If the page loads with ?code=... (Supabase OAuth redirect to Site URL),
 * forward to /api/auth/callback via full page redirect (not client-side nav)
 * so the route handler runs server-side with cookie access for PKCE exchange.
 */
export function OAuthCodeHandler() {
  const params = useSearchParams();
  const code = params.get("code");

  useEffect(() => {
    if (code) {
      window.location.href = `/api/auth/callback?code=${code}`;
    }
  }, [code]);

  return null;
}
