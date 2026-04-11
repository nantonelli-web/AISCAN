"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import translations, {
  type Locale,
  type Translations,
  defaultLocale,
} from "./translations";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** t("dashboard", "greeting") */
  t: (section: string, key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? defaultLocale
  );

  const changeLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Persist in cookie (accessible by server components too)
    document.cookie = `mait-locale=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    // Reload so server components pick up the new locale
    window.location.reload();
  }, []);

  const tFn = useCallback(
    (section: string, key: string): string => {
      const sec = (
        translations as Record<
          string,
          Record<string, Record<Locale, string>>
        >
      )[section];
      if (!sec) return `[${section}.${key}]`;
      const entry = sec[key];
      if (!entry) return `[${section}.${key}]`;
      return entry[locale] ?? entry["it"] ?? `[${section}.${key}]`;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale: changeLocale, t: tFn }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Hook for client components. */
export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT() must be used inside <I18nProvider>");
  }
  return ctx;
}
