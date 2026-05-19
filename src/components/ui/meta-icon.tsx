/**
 * MetaIcon — wrapper sopra il logo brand ufficiale di Meta da
 * `simple-icons` (vedi @/components/icons/channel-icons). L'inline
 * SVG fatto a mano e' stato rimosso 2026-05-19: la libreria
 * simple-icons fornisce il path autorevole (infinity loop preciso
 * di Meta) e si aggiorna automaticamente se il brand mark cambia.
 *
 * API retro-compatibile: `colored=true` → brand color #0866FF
 * applicato dal simple-icons default; senza colored, currentColor.
 */
export { MetaLogo as MetaIcon } from "@/components/icons/channel-icons";
