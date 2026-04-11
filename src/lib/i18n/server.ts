import { cookies } from "next/headers";
import { type Locale, defaultLocale, locales, t as translate } from "./translations";

/**
 * Read the current locale from the `mait-locale` cookie.
 * Falls back to `defaultLocale` ("it").
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get("mait-locale")?.value as Locale | undefined;
  if (raw && locales.includes(raw)) return raw;
  return defaultLocale;
}

/**
 * Server-side translation helper. Same API as the client hook.
 *
 * Usage:
 *   const locale = await getLocale();
 *   const T = serverT(locale);
 *   T("dashboard", "greeting")  // "Buongiorno" or "Good morning"
 */
export function serverT(locale: Locale) {
  return (section: string, key: string) => translate(locale, section, key);
}
