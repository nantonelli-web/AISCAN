/**
 * TikTok SVG icon. Quando colored=true rende il logo "stereoscopico"
 * con offset cyan + rosa che e' il brand kit ufficiale; altrimenti
 * currentColor (monocromatico per liste).
 */
export function TikTokIcon({
  className,
  colored = false,
}: {
  className?: string;
  colored?: boolean;
}) {
  if (colored) {
    const path =
      "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.66a8.16 8.16 0 0 0 4.77 1.52V6.73c0-.04-1.84-.04-1.84-.04Z";
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className={className}
        aria-hidden="true"
      >
        {/* Cyan offset (left) */}
        <path d={path} fill="#25F4EE" transform="translate(-1 0.5)" />
        {/* Rosa offset (right) */}
        <path d={path} fill="#FE2C55" transform="translate(1 -0.5)" />
        {/* Nero in centro */}
        <path d={path} fill="#000" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.66a8.16 8.16 0 0 0 4.77 1.52V6.73c0-.04-1.84-.04-1.84-.04Z" />
    </svg>
  );
}
