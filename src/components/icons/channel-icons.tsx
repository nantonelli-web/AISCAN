/**
 * Channel logos — wrapper sottile sopra @icons-pack/react-simple-icons.
 * I path SVG vengono dal database simple-icons.org, autorevole sui
 * brand mark ufficiali. Usiamo questa libreria invece di inline SVG
 * fatti a mano perche':
 *   1. i path brand sono difficili da riprodurre a mano (l'infinity
 *      loop di Meta in particolare ha curve precise)
 *   2. la libreria si aggiorna automaticamente quando i brand
 *      restilizzano i loro logo
 *   3. tree-shaking
 *
 * Quando `colored={true}` NON passiamo `color` prop: simple-icons
 * usa di default il brand color autorevole baked-in. Quando colored
 * e' false (default), forziamo color="currentColor" per ereditare
 * il text-color del parent (per pillole muted / liste secondarie).
 *
 * **NB**: questo e' il punto unico per i loghi canale. Se servono
 * altrove (Scan, Creativita, Compare, Benchmarks, Monitoring),
 * importare DA QUI — non duplicare svg inline.
 */

import {
  SiMeta,
  SiGoogleads,
  SiInstagram,
  SiTiktok,
  SiSnapchat,
  SiYoutube,
  SiGooglemaps,
} from "@icons-pack/react-simple-icons";

interface IconProps {
  className?: string;
  colored?: boolean;
}

export function MetaLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiMeta className={className} />
  ) : (
    <SiMeta className={className} color="currentColor" />
  );
}

export function GoogleAdsLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiGoogleads className={className} />
  ) : (
    <SiGoogleads className={className} color="currentColor" />
  );
}

export function InstagramLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiInstagram className={className} />
  ) : (
    <SiInstagram className={className} color="currentColor" />
  );
}

export function TiktokLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiTiktok className={className} />
  ) : (
    <SiTiktok className={className} color="currentColor" />
  );
}

export function SnapchatLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiSnapchat className={className} />
  ) : (
    <SiSnapchat className={className} color="currentColor" />
  );
}

export function YouTubeLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiYoutube className={className} />
  ) : (
    <SiYoutube className={className} color="currentColor" />
  );
}

export function GoogleMapsLogo({ className, colored = false }: IconProps) {
  return colored ? (
    <SiGooglemaps className={className} />
  ) : (
    <SiGooglemaps className={className} color="currentColor" />
  );
}

/* Backward-compat aliases — qualche file legacy importa GoogleLogo
   come Google "G" generico per Google Ads. */
export const GoogleLogo = GoogleAdsLogo;
