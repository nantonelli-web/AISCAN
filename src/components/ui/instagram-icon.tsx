/**
 * Instagram SVG icon — matches lucide-react icon API.
 * Quando colored=true rende il gradient ufficiale Instagram
 * (rosa/arancio/giallo dal photo radial). Altrimenti currentColor.
 */
export function InstagramIcon({
  className,
  colored = false,
}: {
  className?: string;
  colored?: boolean;
}) {
  if (colored) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <defs>
          <radialGradient
            id="ig-grad"
            cx="0.3"
            cy="1"
            r="1.2"
            fx="0.3"
            fy="1"
          >
            <stop offset="0%" stopColor="#FED576" />
            <stop offset="26%" stopColor="#F47133" />
            <stop offset="61%" stopColor="#BC3081" />
            <stop offset="100%" stopColor="#4C63D2" />
          </radialGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad)" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="white" strokeWidth="1.8" />
        <circle cx="17.5" cy="6.5" r="1.1" fill="white" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
