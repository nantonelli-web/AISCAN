"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";

interface AvailableCountry {
  code: string;
  name: string;
  count: number;
}

interface Props {
  availableCountries: AvailableCountry[];
  /** Empty set = no filter, show every country. Same convention as
   *  Benchmarks so the trigger label says "All countries" when the
   *  user hasn't narrowed anything yet. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Country popover for the Brand detail filter row — same visual grammar
 * as Benchmarks' CountryFilter (trigger pill + searchable checkbox list)
 * but operating on local state instead of URL params, since Brand detail
 * filters do not survive a navigation.
 *
 * Toggles auto-apply (no Apply button) because the underlying filter is
 * a cheap client-side array filter; staging behind Apply would just add
 * a click for no UX gain.
 */
export function CountryFilterDropdown({
  availableCountries,
  selected,
  onChange,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss — same idiom as the Benchmarks popover.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return availableCountries;
    const q = query.toLowerCase();
    return availableCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query, availableCountries]);

  const total = availableCountries.length;
  const noneSelected = selected.size === 0;
  const allSelected = selected.size === total && total > 0;

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  }

  const triggerLabel = noneSelected
    ? t("benchmarks", "allCountries")
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size}/${total}`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted transition-colors cursor-pointer min-w-[160px] justify-between"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-72 rounded-lg border border-border bg-card shadow-lg p-3 space-y-3">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("benchmarks", "searchCountry")}
              className="h-8 text-xs pl-8"
              autoFocus
            />
          </div>

          {/* Bulk actions — mirrors the Benchmarks popover so the user
              has the same affordances on either page. */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {selected.size}/{total} {t("benchmarks", "countriesLabel")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChange(new Set(availableCountries.map((c) => c.code)))
                }
                disabled={allSelected}
                className="text-gold hover:underline disabled:text-muted-foreground disabled:no-underline cursor-pointer disabled:cursor-default"
              >
                {t("benchmarks", "selectAllBrands")}
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={() => onChange(new Set())}
                disabled={noneSelected}
                className="text-gold hover:underline disabled:text-muted-foreground disabled:no-underline cursor-pointer disabled:cursor-default"
              >
                {t("benchmarks", "selectNoneBrands")}
              </button>
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto border border-border rounded-md divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {t("benchmarks", "noCountryMatch")}
              </p>
            ) : (
              filtered.map((c) => {
                const on = selected.has(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggle(c.code)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                      on
                        ? "bg-gold/5 text-gold hover:bg-gold/10"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                        on
                          ? "bg-gold border-gold text-gold-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-6">
                      {c.code}
                    </span>
                    <span className="truncate flex-1">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {c.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
