"use client";

import { useState } from "react";

export function FallbackImage({
  src,
  alt,
  className,
  fallbackInitial,
}: {
  src: string;
  alt?: string;
  className?: string;
  fallbackInitial?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (fallbackInitial) {
      return (
        <div className={className + " bg-muted grid place-items-center text-muted-foreground font-semibold text-lg"}>
          {fallbackInitial.charAt(0).toUpperCase()}
        </div>
      );
    }
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
