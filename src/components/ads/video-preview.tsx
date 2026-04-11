"use client";

export function VideoPreview({
  src,
  poster,
}: {
  src: string;
  poster?: string;
}) {
  return (
    <video
      src={src}
      poster={poster}
      className="absolute inset-0 w-full h-full object-cover"
      muted
      playsInline
      loop
      onMouseEnter={(e) =>
        (e.target as HTMLVideoElement).play().catch(() => {})
      }
      onMouseLeave={(e) => {
        const v = e.target as HTMLVideoElement;
        v.pause();
        v.currentTime = 0;
      }}
    />
  );
}
