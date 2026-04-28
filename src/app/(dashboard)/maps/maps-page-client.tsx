"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Trash2,
  MapPin,
  Building2,
  MessageSquare,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { formatDate } from "@/lib/utils";
import { getCountries } from "@/config/countries";

interface SearchWithCounts {
  id: string;
  search_term: string;
  location_query: string;
  language: string;
  country_code: string;
  max_places: number;
  max_reviews_per_place: number;
  label: string | null;
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string;
  places_count: number;
  reviews_count: number;
}

interface Props {
  initialSearches: SearchWithCounts[];
}

const COMMON_LANGUAGES = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
];

const COMMON_COUNTRIES = ["IT", "FR", "DE", "ES", "GB", "US"];

export function MapsPageClient({ initialSearches }: Props) {
  const router = useRouter();
  const { t, locale } = useT();
  const allCountries = getCountries(locale);

  const [searches, setSearches] =
    useState<SearchWithCounts[]>(initialSearches);
  const [showForm, setShowForm] = useState(initialSearches.length === 0);

  // Form
  const [searchTerm, setSearchTerm] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [country, setCountry] = useState("IT");
  const [language, setLanguage] = useState("it");
  const [maxPlaces, setMaxPlaces] = useState(20);
  const [maxReviews, setMaxReviews] = useState(10);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  // Per-row state
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setSearchTerm("");
    setLocationQuery("");
    setCountry("IT");
    setLanguage("it");
    setMaxPlaces(20);
    setMaxReviews(10);
    setLabel("");
  }

  async function createSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchTerm.trim() || !locationQuery.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/maps/searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          search_term: searchTerm.trim(),
          location_query: locationQuery.trim(),
          country_code: country,
          language,
          max_places: maxPlaces,
          max_reviews_per_place: maxReviews,
          label: label.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("maps", "createError"));
        return;
      }
      toast.success(t("maps", "createOk"));
      resetForm();
      setShowForm(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function scanSearch(id: string) {
    setScanningId(id);
    const toastId = toast.loading(t("maps", "scanning"));
    try {
      const res = await fetch("/api/maps/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ search_id: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("maps", "scanError"), { id: toastId });
        return;
      }
      toast.success(
        `${json.places_count} ${t("maps", "places")} · ${json.reviews_count} ${t("maps", "reviews")}`,
        { id: toastId },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    } finally {
      setScanningId(null);
    }
  }

  async function deleteSearch(id: string) {
    if (!confirm(t("maps", "deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/maps/searches/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? t("maps", "deleteError"));
        return;
      }
      setSearches((prev) => prev.filter((s) => s.id !== id));
      toast.success(t("maps", "deleted"));
    } finally {
      setDeletingId(null);
    }
  }

  const sortedCountries = [
    ...COMMON_COUNTRIES.map((code) =>
      allCountries.find((c) => c.code === code),
    ).filter((c): c is { code: string; name: string } => !!c),
    ...allCountries
      .filter((c) => !COMMON_COUNTRIES.includes(c.code))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {searches.length}{" "}
          {searches.length === 1
            ? t("maps", "searchSingular")
            : t("maps", "searchPlural")}
        </p>
        <Button
          onClick={() => setShowForm((s) => !s)}
          variant="outline"
          className="gap-2"
        >
          <Plus className="size-4" />
          {showForm ? t("maps", "closeForm") : t("maps", "addSearch")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={createSearch} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mapsTerm">{t("maps", "termLabel")}</Label>
                  <Input
                    id="mapsTerm"
                    required
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("maps", "termPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapsLocation">
                    {t("maps", "locationLabel")}
                  </Label>
                  <Input
                    id="mapsLocation"
                    required
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder={t("maps", "locationPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapsCountry">{t("maps", "countryLabel")}</Label>
                  <select
                    id="mapsCountry"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {sortedCountries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-card">
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapsLanguage">
                    {t("maps", "languageLabel")}
                  </Label>
                  <select
                    id="mapsLanguage"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {COMMON_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code} className="bg-card">
                        {l.code} — {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapsMaxPlaces">
                    {t("maps", "maxPlacesLabel")}
                  </Label>
                  <Input
                    id="mapsMaxPlaces"
                    type="number"
                    min={1}
                    max={100}
                    value={maxPlaces}
                    onChange={(e) =>
                      setMaxPlaces(
                        Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapsMaxReviews">
                    {t("maps", "maxReviewsLabel")}
                  </Label>
                  <Input
                    id="mapsMaxReviews"
                    type="number"
                    min={0}
                    max={50}
                    value={maxReviews}
                    onChange={(e) =>
                      setMaxReviews(
                        Math.min(50, Math.max(0, Number(e.target.value) || 0)),
                      )
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mapsLabel">{t("maps", "labelLabel")}</Label>
                  <Input
                    id="mapsLabel"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("maps", "labelPlaceholder")}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    creating || !searchTerm.trim() || !locationQuery.trim()
                  }
                >
                  {creating ? t("maps", "creating") : t("maps", "createSubmit")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {searches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t("maps", "noSearchesYet")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => {
            const isScanning = scanningId === s.id;
            const isDeleting = deletingId === s.id;
            return (
              <Card
                key={s.id}
                className="hover:border-gold/40 transition-colors"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-4">
                    <MapPin className="size-5 text-gold shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/maps/${s.id}`}
                        className="text-base font-medium hover:text-gold transition-colors break-words"
                      >
                        {s.search_term}{" "}
                        <span className="text-muted-foreground font-normal">
                          @ {s.location_query}
                        </span>
                      </Link>
                      {s.label && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.label}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          <Globe className="size-3 mr-1" />
                          {s.country_code}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {s.language}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          ≤ {s.max_places} {t("maps", "places")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          ≤ {s.max_reviews_per_place} {t("maps", "reviews")}/place
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => scanSearch(s.id)}
                        disabled={isScanning || isDeleting}
                        className="gap-1.5"
                      >
                        {isScanning ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        {isScanning
                          ? t("maps", "scanningShort")
                          : t("maps", "scanAction")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSearch(s.id)}
                        disabled={isScanning || isDeleting}
                        className="size-8 p-0 text-muted-foreground hover:text-red-400"
                      >
                        {isDeleting ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3" />
                      <b className="text-foreground tabular-nums">
                        {s.places_count}
                      </b>{" "}
                      {t("maps", "places")}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-3" />
                      <b className="text-foreground tabular-nums">
                        {s.reviews_count}
                      </b>{" "}
                      {t("maps", "reviews")}
                    </span>
                    {s.last_scraped_at ? (
                      <span className="ml-auto">
                        {t("maps", "lastScraped")}{" "}
                        {formatDate(s.last_scraped_at)}
                      </span>
                    ) : (
                      <span className="ml-auto italic">
                        {t("maps", "neverScraped")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
