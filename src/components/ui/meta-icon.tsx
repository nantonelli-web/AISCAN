/**
 * Meta logo (infinity shape) — represents the full Meta platform
 * (Facebook, Instagram, Messenger, Audience Network).
 *
 * Quando `colored=true` rende il logo con il gradient blu ufficiale
 * Meta (#0081FB → #0064E1 → #0064E1). Altrimenti currentColor (per
 * usi in liste/filtri muted).
 */
export function MetaIcon({
  className,
  colored = false,
}: {
  className?: string;
  colored?: boolean;
}) {
  if (colored) {
    return (
      <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
        <defs>
          <linearGradient id="meta-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0081FB" />
            <stop offset="60%" stopColor="#0064E1" />
            <stop offset="100%" stopColor="#0040A6" />
          </linearGradient>
        </defs>
        <path
          d="M20.181 11.092c-1.358 2.094-2.4 4.39-3.184 6.072-.785-1.681-1.826-3.978-3.184-6.072-2.32-3.578-4.345-5.092-6.808-5.092-3.998 0-7.005 3.487-7.005 8.997 0 5.51 3.007 8.997 7.005 8.997 2.463 0 4.488-1.514 6.808-5.092 1.358-2.094 2.4-4.39 3.184-6.072.785 1.681 1.826 3.978 3.184 6.072 2.32 3.578 4.345 5.092 6.808 5.092 3.998 0 7.011-3.487 7.011-8.997 0-5.51-3.013-8.997-7.011-8.997-2.463 0-4.488 1.514-6.808 5.092Zm-6.36 6.072c-.93 1.96-2.108 4.43-3.91 4.43-1.717 0-2.83-1.708-2.83-4.597 0-2.89 1.113-4.598 2.83-4.598 1.802 0 2.98 2.47 3.91 4.43.273.578.516 1.114.736 1.583a32.07 32.07 0 0 1-.736 1.584l-.001-.832Zm17.4-.167c0 2.89-1.113 4.597-2.83 4.597-1.802 0-2.98-2.47-3.91-4.43a31.99 31.99 0 0 1-.735-1.584c.22-.469.464-1.005.736-1.583.93-1.96 2.108-4.43 3.91-4.43 1.717 0 2.83 1.708 2.83 4.598z"
          fill="url(#meta-grad)"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
    </svg>
  );
}
