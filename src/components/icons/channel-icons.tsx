/**
 * Channel logos — wrapper sopra @icons-pack/react-simple-icons.
 * I path SVG vengono dal database simple-icons.org, autorevole sui
 * brand mark ufficiali. Quando `colored={true}` passiamo color="default"
 * (la libreria internamente la traduce in defaultColor brand). Senza
 * colored forziamo color="currentColor" per ereditare il text-color
 * del parent (per usi in liste muted / placeholder).
 *
 * **NB importante**: il default della libreria simple-icons e' GIA'
 * "currentColor" (vedi `color = "currentColor"` di default in
 * SiMeta etc). Quindi `<SiMeta />` senza color → monocromatico
 * che eredita text-color. Per ottenere il brand color SERVE
 * passare `color="default"` esplicito.
 *
 * **NB integrazione**: questo e' il punto unico per i loghi canale.
 * Se servono altrove (Scan, Creativita, Compare, Benchmarks,
 * Monitoring), importare DA QUI — non duplicare svg inline.
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

const colorFor = (colored: boolean) => (colored ? "default" : "currentColor");

export function MetaLogo({ className, colored = false }: IconProps) {
  return <SiMeta className={className} color={colorFor(colored)} />;
}

export function GoogleAdsLogo({ className, colored = false }: IconProps) {
  return <SiGoogleads className={className} color={colorFor(colored)} />;
}

export function InstagramLogo({ className, colored = false }: IconProps) {
  return <SiInstagram className={className} color={colorFor(colored)} />;
}

export function TiktokLogo({ className, colored = false }: IconProps) {
  return <SiTiktok className={className} color={colorFor(colored)} />;
}

export function SnapchatLogo({ className, colored = false }: IconProps) {
  return <SiSnapchat className={className} color={colorFor(colored)} />;
}

export function YouTubeLogo({ className, colored = false }: IconProps) {
  return <SiYoutube className={className} color={colorFor(colored)} />;
}

export function GoogleMapsLogo({ className, colored = false }: IconProps) {
  return <SiGooglemaps className={className} color={colorFor(colored)} />;
}

/* Backward-compat alias — qualche file legacy importa GoogleLogo
   come Google "G" generico per Google Ads. */
export const GoogleLogo = GoogleAdsLogo;
