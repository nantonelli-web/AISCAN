"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitCompetitor } from "@/types";

import { COUNTRIES } from "@/config/countries";

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
  const [instagramUsername, setInstagramUsername] = useState(competitor.instagram_username ?? "");
  const [googleAdvertiserId, setGoogleAdvertiserId] = useState(competitor.google_advertiser_id ?? "");
  const [googleDomain, setGoogleDomain] = useState(competitor.google_domain ?? "");
  const [clientId, setClientId] = useState(competitor.client_id ?? "");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
  }, []);
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
        client_id: clientId || null,
        instagram_username: instagramUsername.replace(/^@/, "").trim() || null,
        google_advertiser_id: googleAdvertiserId.trim() || null,
        google_domain: googleDomain.trim() || null,
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
              <Label htmlFor="instagram">{t("newCompetitor", "instagramLabel")}</Label>
              <Input
                id="instagram"
                value={instagramUsername}
                onChange={(e) => setInstagramUsername(e.target.value)}
                placeholder={t("newCompetitor", "instagramPlaceholder")}
              />
            </div>

            {/* Google Ads fields */}
            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-3">
                {t("newCompetitor", "googleAdsSection")}
              </p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="googleDomain">{t("newCompetitor", "googleDomainLabel")}</Label>
                  <Input
                    id="googleDomain"
                    value={googleDomain}
                    onChange={(e) => setGoogleDomain(e.target.value)}
                    placeholder="nike.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="googleAdvertiserId">{t("newCompetitor", "googleAdvertiserIdLabel")}</Label>
                  <Input
                    id="googleAdvertiserId"
                    value={googleAdvertiserId}
                    onChange={(e) => setGoogleAdvertiserId(e.target.value)}
                    placeholder="AR15497895950085120"
                  />
                </div>
              </div>
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
            <div className="space-y-2">
              <Label>{t("clients", "clientLabel")}</Label>
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
              <div className="flex gap-1.5">
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t("clients", "newClientPlaceholder")}
                  className="text-xs h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newClientName.trim()) return;
                      fetch("/api/clients", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ name: newClientName.trim() }),
                      })
                        .then((r) => r.json())
                        .then((json) => {
                          if (json.id) {
                            setClients((prev) => [...prev, json]);
                            setClientId(json.id);
                            setNewClientName("");
                          }
                        });
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 shrink-0"
                  onClick={() => {
                    if (!newClientName.trim()) return;
                    fetch("/api/clients", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name: newClientName.trim() }),
                    })
                      .then((r) => r.json())
                      .then((json) => {
                        if (json.id) {
                          setClients((prev) => [...prev, json]);
                          setClientId(json.id);
                          setNewClientName("");
                        }
                      });
                  }}
                  disabled={!newClientName.trim()}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
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
