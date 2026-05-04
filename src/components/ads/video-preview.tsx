"use client";

/**
 * Hover-play video preview. The `onError` callback is critical
 * for Meta scraped video URLs: scontent.fbcdn.net / video.fbcdn.net
 * gate cross-origin <video> reads on Referer, so the request from
 * aiscan.io 403s and the element renders blank/grey. Without an
 * error handler the card looked like a UI malfunction (user
 * feedback 2026-05-04: "anteprima rimasta invariata, quadrato
 * grigio"). Now the parent card can swap in <VideoUnavailable />
 * the moment the video fails. TikTok already routes through the
 * /api/proxy/tiktok-video same-origin proxy so it doesn't need
 * the fallback path; Meta would too if we added one but the
 * fallback placeholder is a cleaner UX since Meta video CDN
 * tokens also expire shortly after the scan.
 */
export function VideoPreview({
  src,
  poster,
  onError,
}: {
  src: string;
  poster?: string;
  onError?: () => void;
}) {
  return (
    <video
      src={src}
      poster={poster}
      className="absolute inset-0 w-full h-full object-cover"
      muted
      playsInline
      loop
      onError={onError}
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
