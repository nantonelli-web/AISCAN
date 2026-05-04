"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Smart back link for the ad detail page. Honours the browser
 * history when the user came from inside the app (Library, brand
 * detail, Compare, …) so the back navigation feels natural —
 * "back goes where I was". When history is missing (deep link
 * from external source / direct URL load), falls through to the
 * server-supplied fallback href so the user is not stranded.
 *
 * Why not a plain Link with `?tab=meta`: that always lands on the
 * brand detail page even when the user came from /library, which
 * the user (correctly) flagged as the wrong behaviour.
 */
export function BackLink({
  fallbackHref,
  label,
}: {
  fallbackHref: string;
  label: string;
}) {
  const router = useRouter();

  function onClick() {
    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }
    // document.referrer is empty when the user opens the URL
    // directly (bookmark, copy/paste, external email link).
    // Same-origin check protects against bouncing the user out
    // to a third-party page when the referrer is from elsewhere.
    const ref = document.referrer;
    const sameOrigin = ref && ref.startsWith(window.location.origin);
    if (sameOrigin && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}
