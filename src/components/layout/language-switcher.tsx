"use client";

import { useT } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";

const options: { value: Locale; label: string }[] = [
  { value: "it", label: "IT" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useT();

  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLocale(opt.value)}
          className={`px-2 py-1 transition-colors ${
            locale === opt.value
              ? "bg-gold/15 text-gold font-semibold"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
