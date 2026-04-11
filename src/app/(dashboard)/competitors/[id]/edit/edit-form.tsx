"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitCompetitor } from "@/types";

const COUNTRIES = [
  { code: "IT", name: "Italia" },
  { code: "AE", name: "UAE" },
  { code: "US", name: "USA" },
  { code: "GB", name: "UK" },
  { code: "DE", name: "Germania" },
  { code: "FR", name: "Francia" },
  { code: "ES", name: "Spagna" },
  { code: "PT", name: "Portogallo" },
  { code: "NL", name: "Olanda" },
  { code: "BE", name: "Belgio" },
  { code: "CH", name: "Svizzera" },
  { code: "AT", name: "Austria" },
  { code: "SA", name: "Arabia Saudita" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "EG", name: "Egitto" },
  { code: "TR", name: "Turchia" },
  { code: "IN", name: "India" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "BR", name: "Brasile" },
  { code: "MX", name: "Messico" },
  { code: "JP", name: "Giappone" },
  { code: "KR", name: "Corea del Sud" },
  { code: "CN", name: "Cina" },
  { code: "SG", name: "Singapore" },
  { code: "SE", name: "Svezia" },
  { code: "NO", name: "Norvegia" },
  { code: "DK", name: "Danimarca" },
  { code: "FI", name: "Finlandia" },
  { code: "PL", name: "Polonia" },
  { code: "GR", name: "Grecia" },
  { code: "IE", name: "Irlanda" },
  { code: "IL", name: "Israele" },
  { code: "ZA", name: "Sudafrica" },
  { code: "NG", name: "Nigeria" },
];

const CATEGORIES = [
  "Fashion",
  "Luxury",
  "E-Commerce",
  "Beauty & Cosmetics",
  "Fitness & Sport",
  "Food & Beverage",
  "Travel & Hospitality",
  "Real Estate",
  "Automotive",
  "Finance & Insurance",
  "Healthcare",
  "Education",
  "SaaS & Technology",
  "Entertainment & Media",
  "Home & Furniture",
  "Jewelry & Watches",
  "Kids & Baby",
  "Pets",
  "Gaming",
  "Non-Profit",
];

function parseCountries(val: string | null): string[] {
  if (!val) return [];
  return val
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function EditCompetitorForm({
  competitor,
}: {
  competitor: MaitCompetitor;
}) {
  const router = useRouter();
  const [pageName, setPageName] = useState(competitor.page_name);
  const [pageUrl, setPageUrl] = useState(competitor.page_url);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    parseCountries(competitor.country)
  );
  const [category, setCategory] = useState(competitor.category ?? "");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const { t } = useT();

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function removeCountry(code: string) {
    setSelectedCountries((prev) => prev.filter((c) => c !== code));
  }

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/competitors/${competitor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page_name: pageName,
        page_url: pageUrl,
        country: selectedCountries.length > 0 ? selectedCountries.join(", ") : null,
        category: category || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Error" }));
      toast.error(json.error);
      return;
    }
    toast.success(t("editCompetitor", "saved"));
    router.push(`/competitors/${competitor.id}`);
    router.refresh();
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/competitors/${competitor.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!res.ok) {
      toast.error(t("editCompetitor", "deleteError"));
      return;
    }
    toast.success(t("editCompetitor", "deleted"));
    router.push("/competitors");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("newCompetitor", "pageNameLabel")}</Label>
              <Input
                id="name"
                required
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">{t("newCompetitor", "pageUrlLabel")}</Label>
              <Input
                id="url"
                required
                type="url"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">{t("newCompetitor", "categoryLabel")}</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <option value="" className="bg-card">
                  — {t("newCompetitor", "selectCategory")}
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-card">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("newCompetitor", "countryLabel")}</Label>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCountries.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-1 text-xs font-medium"
                  >
                    {code}
                    <button type="button" onClick={() => removeCountry(code)} className="hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder={t("newCompetitor", "searchCountry")}
              className="text-xs"
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 grid grid-cols-2 gap-1">
              {filteredCountries.map((c) => {
                const selected = selectedCountries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                      selected
                        ? "bg-gold/15 text-gold border border-gold/30"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="font-medium w-6">{c.code}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t("editCompetitor", "saving") : t("editCompetitor", "save")}
        </Button>
      </form>

      {/* Delete section */}
      <div className="border-t border-border pt-6">
        {!confirmDelete ? (
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            className="text-red-400 border-red-400/30 hover:bg-red-400/10 hover:border-red-400/50"
          >
            <Trash2 className="size-4" />
            {t("editCompetitor", "deleteBtn")}
          </Button>
        ) : (
          <div className="p-4 rounded-lg border border-red-400/30 bg-red-400/5 space-y-3">
            <p className="text-sm">
              {t("editCompetitor", "deleteConfirm")} <b>{competitor.page_name}</b>?
              {" "}{t("editCompetitor", "deleteWarning")}
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? t("editCompetitor", "deletingProgress") : t("editCompetitor", "confirmDelete")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {t("editCompetitor", "cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
