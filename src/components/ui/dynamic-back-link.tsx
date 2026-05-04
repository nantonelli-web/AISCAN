"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Smart "back" link generalised from the per-ad BackLink that already
 * lives in the ad detail page. Honours browser history when the user
 * arrived from inside the app (Library, Compare, brand detail, …) so
 * the back navigation feels natural — "back goes where I was" — and
 * falls through to the server-supplied fallback when history is
 * missing (deep link, copy/paste, refresh after navigation).
 *
 * Use this in any client-rendered page header where the section can
 * be reached from multiple entry points and a static fallback href
 * would mis-route part of the audience.
 */
export function DynamicBackLink({
  fallbackHref,
  label,
  className,
}: {
  fallbackHref: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  function onClick() {
    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }
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
      className={
        className ??
        "inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      }
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}
