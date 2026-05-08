/**
 * Channel logos — wrapper sottile sopra @icons-pack/react-simple-icons.
 * I path SVG vengono dal database simple-icons.org, autorevole sui
 * brand mark ufficiali dei prodotti (Meta, Google Ads, TikTok,
 * Snapchat). Usiamo questa libreria invece di inline SVG fatti a
 * mano perche':
 *   1. i path brand sono difficili da riprodurre a mano (l'infinity
 *      loop di Meta in particolare ha curve precise)
 *   2. la libreria si aggiorna automaticamente quando i brand
 *      restilizzano i loro logo (es. Twitter -> X)
 *   3. tree-shaking: solo i componenti effettivamente usati in
 *      questo file finiscono nel bundle finale.
 *
 * Esposti come componenti React standard accettando `className`
 * cosi possono ereditare colore (currentColor) e dimensione dal
 * parent (es. text-[#0866ff] size-5).
 */

import {
  SiMeta,
  SiGoogleads,
  SiTiktok,
  SiSnapchat,
} from "@icons-pack/react-simple-icons";

interface IconProps {
  className?: string;
}

export function MetaLogo({ className }: IconProps) {
  return <SiMeta className={className} />;
}

export function GoogleLogo({ className }: IconProps) {
  return <SiGoogleads className={className} />;
}

export function TiktokLogo({ className }: IconProps) {
  return <SiTiktok className={className} />;
}

export function SnapchatLogo({ className }: IconProps) {
  return <SiSnapchat className={className} />;
}
