"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

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

interface ClientOption {
  id: string;
  name: string;
  color: string;
}

export function NewCompetitorForm() {
  const router = useRouter();
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
  }, []);
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

  async function createClient() {
    if (!newClientName.trim()) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newClientName.trim() }),
    });
    const json = await res.json();
    if (res.ok && json.id) {
      setClients((prev) => [...prev, json]);
      setClientId(json.id);
      setNewClientName("");
      toast.success(`${t("clients", "created")}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/competitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page_name: pageName,
        page_url: pageUrl,
        country: selectedCountries.length > 0 ? selectedCountries.join(", ") : null,
        category: category || null,
        client_id: clientId || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const { error } = await res
        .json()
        .catch(() => ({ error: t("newCompetitor", "error") }));
      toast.error(error);
      return;
    }
    const { id } = await res.json();
    toast.success(t("newCompetitor", "created"));
    router.push(`/competitors/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("newCompetitor", "pageNameLabel")}</Label>
            <Input
              id="name"
              required
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder={t("newCompetitor", "pageNamePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">
              {t("newCompetitor", "pageUrlLabel")}
            </Label>
            <Input
              id="url"
              required
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://www.facebook.com/nike"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">
              {t("newCompetitor", "categoryLabel")}
            </Label>
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
          <div className="space-y-2">
            <Label>{t("clients", "clientLabel")}</Label>
            <div className="flex gap-2">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <option value="" className="bg-card">
                  — {t("clients", "noClient")}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-card">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={t("clients", "newClientPlaceholder")}
                className="text-xs h-8"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createClient())}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0"
                onClick={createClient}
                disabled={!newClientName.trim()}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right column — Country multi-select */}
        <div className="space-y-2">
          <Label>{t("newCompetitor", "countryLabel")}</Label>

          {/* Selected countries chips */}
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedCountries.map((code) => {
                const c = COUNTRIES.find((x) => x.code === code);
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-1 text-xs font-medium"
                  >
                    {code}
                    <button
                      type="button"
                      onClick={() => removeCountry(code)}
                      className="hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search */}
          <Input
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder={t("newCompetitor", "searchCountry")}
            className="text-xs"
          />

          {/* Country grid */}
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
            {filteredCountries.length === 0 && (
              <p className="col-span-2 text-center text-[10px] text-muted-foreground py-4">
                {t("newCompetitor", "noCountryMatch")}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? t("newCompetitor", "createLoading")
          : t("newCompetitor", "createSubmit")}
      </Button>
    </form>
  );
}
