"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText,
  FileDown,
  Upload,
  Loader2,
  Check,
  X,
  Trash2,
  GitCompareArrows,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { PageLoader } from "@/components/ui/page-loader";
import { useT } from "@/lib/i18n/context";
import type { MaitCompetitor } from "@/types";

// ─── Types ───────────────────────────────────────────────────────

interface ClientRecord {
  id: string;
  name: string;
}

interface TemplateRecord {
  id: string;
  client_id: string;
  name: string;
  file_type: string;
  created_at: string;
}

interface SavedComparison {
  id: string;
  competitor_ids: string[];
  locale: string;
  stale: boolean;
  updated_at: string;
  hasCopy: boolean;
  hasVisual: boolean;
  /** Analysis window stored alongside the comparison (migration 0019).
   *  Forwarded to /api/report/generate so the report metrics use the
   *  same window the user saw in Compare. NULL for legacy rows. */
  date_from: string | null;
  date_to: string | null;
  /** Filters that scoped the saved Compare. Forwarded to the report
   *  pipeline so the generated PPTX/PDF reflects the same selection. */
  countries: string[] | null;
  channel: string | null;
}

type ReportType = "single" | "comparison";
type ReportChannel = "all" | "meta" | "google" | "instagram";
type ReportFormat = "pptx" | "pdf";
type ReportLocale = "it" | "en";

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter", preview: "Aa Bb Cc 123" },
  { value: "Montserrat", label: "Montserrat", preview: "Aa Bb Cc 123" },
  { value: "Poppins", label: "Poppins", preview: "Aa Bb Cc 123" },
  { value: "Roboto", label: "Roboto", preview: "Aa Bb Cc 123" },
  { value: "Open Sans", label: "Open Sans", preview: "Aa Bb Cc 123" },
  { value: "Lato", label: "Lato", preview: "Aa Bb Cc 123" },
  { value: "Playfair Display", label: "Playfair Display", preview: "Aa Bb Cc 123" },
  { value: "Raleway", label: "Raleway", preview: "Aa Bb Cc 123" },
  { value: "Nunito", label: "Nunito", preview: "Aa Bb Cc 123" },
];

// ─── Component ───────────────────────────────────────────────────

export function ReportBuilder({
  competitors,
  clients,
  templates: initialTemplates,
  savedComparisons = [],
}: {
  competitors: MaitCompetitor[];
  clients: ClientRecord[];
  templates: TemplateRecord[];
  savedComparisons?: SavedComparison[];
}) {
  const { t, locale } = useT();

  // State
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [channel, setChannel] = useState<ReportChannel>("all");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  // Comparison mode: main brand + selected saved comparisons
  const [mainBrandId, setMainBrandId] = useState<string | null>(null);
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [reportLocale, setReportLocale] = useState<ReportLocale>(locale as ReportLocale);
  const [contentSections, setContentSections] = useState<Set<'technical' | 'copy' | 'visual' | 'benchmark'>>(new Set(['technical']));
  const [fontFamily, setFontFamily] = useState("Inter");
  const [format, setFormat] = useState<ReportFormat>("pptx");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingBrands, setMissingBrands] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

  // Template upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadClientId, setUploadClientId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRecord[]>(initialTemplates);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived values
  const selectedArray = [...selectedBrands];

  // For comparison mode: filter saved comparisons that include the main brand
  const filteredComparisons = mainBrandId
    ? savedComparisons.filter((sc) => sc.competitor_ids.includes(mainBrandId))
    : [];


  // Get client_id for the first selected brand (for template filtering)
  const firstBrand = reportType === "comparison"
    ? competitors.find((c) => c.id === mainBrandId)
    : competitors.find((c) => selectedBrands.has(c.id));
  const selectedClientId = firstBrand?.client_id ?? null;
  const filteredTemplates = selectedClientId
    ? templates.filter((t) => t.client_id === selectedClientId)
    : templates;

  const selectedTemplate = templateId
    ? templates.find((t) => t.id === templateId)
    : null;

  // Auto-select first saved template when available
  const filteredTemplateKey = filteredTemplates.map((t) => t.id).join(",");
  useEffect(() => {
    if (filteredTemplates.length > 0 && templateId === null) {
      setTemplateId(filteredTemplates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTemplateKey]);

  // Check which channels are disabled based on selected brands' config
  const selectedComps = competitors.filter((c) => selectedBrands.has(c.id));
  const googleDis = selectedComps.length > 0 && selectedComps.some((c) => !c.google_advertiser_id && !c.google_domain);
  const instagramDis = selectedComps.length > 0 && selectedComps.some((c) => !c.instagram_username);
  const channelDisabled: Record<ReportChannel, boolean> = {
    meta: false,
    google: googleDis,
    instagram: instagramDis,
    all: googleDis || instagramDis,
  };

  // Can generate?
  const canGenerate =
    reportType === "single"
      ? selectedBrands.size === 1 && !channelDisabled[channel]
      : selectedComparisonIds.size > 0;

  // ─── Handlers ────────────────────────────────────────────────

  function toggleBrand(id: string) {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    // Auto-select first matching template for this brand, or null
    const brand = competitors.find((c) => c.id === id);
    const clientId = brand?.client_id ?? null;
    const matching = clientId ? templates.filter((t) => t.client_id === clientId) : templates;
    setTemplateId(matching.length > 0 ? matching[0].id : null);
  }

  function switchType(type: ReportType) {
    setReportType(type);
    setSelectedBrands(new Set());
    setMainBrandId(null);
    setSelectedComparisonIds(new Set());
    setTemplateId(null);
    setChannel("all");
  }

  async function handleScanMissing() {
    setScanning(true);
    setError(null);
    const idsToScan = [...selectedBrands].filter((id) => {
      const comp = competitors.find((c) => c.id === id);
      return comp && missingBrands.includes(comp.page_name);
    });

    for (const id of idsToScan) {
      try {
        const endpoint =
          channel === "google" ? "/api/apify/scan-google"
          : channel === "instagram" ? "/api/instagram/scan"
          : "/api/apify/scan";
        const body =
          channel === "instagram"
            ? { competitor_id: id, max_posts: 30 }
            : { competitor_id: id, max_items: 200 };
        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // Continue
      }
    }

    setScanning(false);
    setMissingBrands([]);
    // Auto-generate after scan
    doGenerate();
  }

  async function handleGenerate() {
    setError(null);
    setMissingBrands([]);

    // Check if brands have data for the selected channel
    if (channel !== "all") {
      try {
        const checkRes = await fetch(
          `/api/competitors/check-channel?ids=${selectedArray.join(",")}&channel=${channel}`
        );
        if (checkRes.ok) {
          const { results } = await checkRes.json();
          const missing = (results as { id: string; count: number }[])
            .filter((r) => r.count === 0)
            .map((r) => {
              const comp = competitors.find((c) => c.id === r.id);
              return comp?.page_name ?? r.id;
            });
          if (missing.length > 0) {
            setMissingBrands(missing);
            return;
          }
        }
      } catch {
        // Proceed anyway
      }
    }

    doGenerate();
  }

  async function doGenerate() {
    setGenerating(true);
    setGenerated(false);
    setProgress(0);
    setError(null);

    // Simulated progress (actual generation is server-side, no streaming progress)
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p; // cap at 90% until response arrives
        return p + Math.random() * 8 + 2;
      });
    }, 800);

    try {
      // For comparison mode, use brand IDs from first selected comparison
      let idsForReport: string[];
      let reportDateFrom: string | null = null;
      let reportDateTo: string | null = null;
      let reportCountries: string[] | null = null;
      let reportChannel: ReportChannel = channel;
      if (reportType === "comparison") {
        const firstScId = [...selectedComparisonIds][0];
        const sc = savedComparisons.find((s) => s.id === firstScId);
        idsForReport = sc?.competitor_ids ?? [];
        // Inherit every analysis filter the user picked when saving
        // the comparison so the report is a one-to-one snapshot.
        // Legacy rows (where these were not yet persisted) fall back
        // to the API defaults.
        reportDateFrom = sc?.date_from ?? null;
        reportDateTo = sc?.date_to ?? null;
        reportCountries = sc?.countries ?? null;
        const savedChannel = sc?.channel as ReportChannel | null | undefined;
        if (
          savedChannel === "meta" ||
          savedChannel === "google" ||
          savedChannel === "instagram" ||
          savedChannel === "all"
        ) {
          reportChannel = savedChannel;
        } else {
          reportChannel = "meta";
        }
      } else {
        idsForReport = selectedArray;
      }

      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: reportType,
          channel: reportType === "comparison" ? reportChannel : channel,
          competitor_ids: idsForReport,
          template_id: templateId ?? undefined,
          format,
          locale: reportLocale,
          sections: [...contentSections],
          font_family: fontFamily,
          ...(reportDateFrom && reportDateTo
            ? { date_from: reportDateFrom, date_to: reportDateTo }
            : {}),
          ...(reportCountries && reportCountries.length > 0
            ? { countries: reportCountries }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[AISCAN report] Error:", res.status, data);
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `report.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report", "errorGeneration"));
    } finally {
      if (progressRef.current) clearInterval(progressRef.current);
      setGenerating(false);
    }
  }

  async function handleUploadTemplate() {
    if (!uploadFile || !uploadName.trim()) return;
    // Prefer the explicit client picked in the upload form. If empty, fall
    // back to the client of the first selected brand (when the user has
    // already gotten that far). Without either, block.
    const clientIdForUpload = uploadClientId || selectedClientId || "";
    if (!clientIdForUpload) {
      setError(t("report", "uploadPickClient"));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      // Step 1: Get a signed upload URL from the server
      const urlRes = await fetch("/api/report/templates/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: uploadFile.name,
          client_id: clientIdForUpload,
        }),
      });
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to get upload URL");
      }
      const urlData = await urlRes.json();
      const { signedUrl, storagePath } = urlData;
      console.log("[AISCAN template] Step 1 OK — signed URL:", signedUrl?.slice(0, 80));

      // Step 2: Upload file directly to Supabase Storage via signed URL
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        body: uploadFile,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        console.error("[AISCAN template] Step 2 FAILED:", uploadRes.status, errText);
        throw new Error(`Storage upload failed: ${uploadRes.status} ${errText.slice(0, 200)}`);
      }
      console.log("[AISCAN template] Step 2 OK — file uploaded to:", storagePath);

      // Step 3: Call API to parse the template and save DB record
      const res = await fetch("/api/report/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: clientIdForUpload,
          name: uploadName.trim(),
          storage_path: storagePath,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const record = await res.json();
      console.log("[AISCAN template] Step 3 OK — record saved:", record.id, record.name);
      setTemplates((prev) => [record, ...prev]);
      setTemplateId(record.id);
      setShowUpload(false);
      setUploadName("");
      setUploadFile(null);
      setUploadClientId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report", "errorGeneration"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      const res = await fetch(`/api/report/templates/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        if (templateId === id) setTemplateId(null);
      }
    } catch {
      // Ignore
    }
  }

  // ─── Render ──────────────────────────────────────────────────

  const googleFontsUrl = "https://fonts.googleapis.com/css2?family=" +
    FONT_OPTIONS.map((f) => f.value.replace(/ /g, "+")).join("&family=") +
    "&display=swap";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Load Google Fonts for preview */}
      <link rel="stylesheet" href={googleFontsUrl} />

      {/* Step 1: Report Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            1. {t("report", "title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={reportType === "comparison" ? "default" : "outline"}
              size="sm"
              onClick={() => switchType("comparison")}
              className=""
            >
              {t("report", "typeComparison")}
            </Button>
            <Button
              variant={reportType === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => switchType("single")}
              className=""
            >
              {t("report", "typeSingle")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── SINGLE MODE: Select Brand → Channel ─── */}
      {reportType === "single" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">2. {t("report", "selectBrand")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {competitors.map((c) => {
                  const isSelected = selectedBrands.has(c.id);
                  return (
                    <Button
                      key={c.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleBrand(c.id)}
                    >
                      {c.page_name}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Channel — only for single mode */}
          {selectedBrands.size === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              3. {t("report", "channel")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Paid channels */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Paid</span>
                <Button variant={channel === "meta" ? "default" : "outline"} size="sm"
                  onClick={() => setChannel("meta")} className="gap-1.5"
                >
                  <MetaIcon className="size-4" />
                  Meta Ads
                </Button>
                <Button variant={channel === "google" ? "default" : "outline"} size="sm"
                  onClick={() => !channelDisabled.google && setChannel("google")}
                  disabled={channelDisabled.google}
                  className={cn("gap-1.5", channelDisabled.google && "opacity-40 cursor-not-allowed")}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" /><path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" /></svg>
                  Google Ads
                </Button>
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              {/* Organic channels */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Organic</span>
                <Button variant={channel === "instagram" ? "default" : "outline"} size="sm"
                  onClick={() => !channelDisabled.instagram && setChannel("instagram")}
                  disabled={channelDisabled.instagram}
                  className={cn("gap-1.5", channelDisabled.instagram && "opacity-40 cursor-not-allowed")}
                >
                  <InstagramIcon className="size-4" />
                  Instagram
                </Button>
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              {/* All channels */}
              <Button variant={channel === "all" ? "default" : "outline"} size="sm"
                onClick={() => !channelDisabled.all && setChannel("all")} disabled={channelDisabled.all}
                className={cn(channelDisabled.all && "opacity-40 cursor-not-allowed")}
              >
                {t("report", "channelAll")}
              </Button>
            </div>
            {/* Detailed disabled reasons */}
            {(() => {
              const details: { brand: string; id: string; ch: string; reason: string }[] = [];
              for (const c of selectedComps) {
                if (!c.google_advertiser_id && !c.google_domain)
                  details.push({ brand: c.page_name, id: c.id, ch: "Google Ads", reason: t("report", "missingGoogleConfig") });
                if (!c.instagram_username)
                  details.push({ brand: c.page_name, id: c.id, ch: "Instagram", reason: t("report", "missingInstagramConfig") });
              }
              if (details.length === 0) return null;
              return (
                <div className="rounded-md border border-gold/30 bg-gold/5 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-gold">{t("report", "configRequired")}</p>
                  {details.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-medium">{d.brand}</span>
                      <span className="text-muted-foreground">— {d.ch}: {d.reason}</span>
                      <a href={`/competitors/${d.id}/edit?from=report`} className="ml-auto shrink-0">
                        <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer">{t("report", "goToEdit")}</Button>
                      </a>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
          )}
        </>
      )}

      {/* ─── COMPARISON MODE: Select Main Brand → Select Saved Comparisons ─── */}
      {reportType === "comparison" && (
        <>
          {/* Step 2: Select main brand */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">2. {t("report", "selectMainBrand")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {competitors.map((c) => (
                  <Button
                    key={c.id}
                    variant={mainBrandId === c.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newId = mainBrandId === c.id ? null : c.id;
                      setMainBrandId(newId);
                      setSelectedComparisonIds(new Set());
                      // Auto-select first matching template
                      const clientId = newId ? (competitors.find((x) => x.id === newId)?.client_id ?? null) : null;
                      const matching = clientId ? templates.filter((t) => t.client_id === clientId) : templates;
                      setTemplateId(matching.length > 0 ? matching[0].id : null);
                    }}
                  >
                    {c.page_name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Select saved comparisons */}
          {mainBrandId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">3. {t("report", "selectComparisons")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredComparisons.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("report", "noSavedComparisons")}
                    </p>
                    <Button asChild variant="outline" size="sm" className="gap-1.5 cursor-pointer">
                      <Link href="/competitors/compare">{t("report", "goToCompare")}</Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t("report", "selectComparisonsHint")}
                    </p>
                    {filteredComparisons.length > 1 && (
                      <button
                        onClick={() => {
                          if (selectedComparisonIds.size === filteredComparisons.length) {
                            setSelectedComparisonIds(new Set());
                          } else {
                            setSelectedComparisonIds(new Set(filteredComparisons.map((sc) => sc.id)));
                          }
                        }}
                        className="text-xs text-muted-foreground hover:text-gold transition-colors underline cursor-pointer"
                      >
                        {selectedComparisonIds.size === filteredComparisons.length ? "Deseleziona tutti" : t("compare", "selectAll")}
                      </button>
                    )}
                    <div className="grid gap-2">
                      {filteredComparisons.map((sc) => {
                        const otherBrands = sc.competitor_ids
                          .filter((id) => id !== mainBrandId)
                          .map((id) => competitors.find((c) => c.id === id)?.page_name)
                          .filter(Boolean);
                        const isSelected = selectedComparisonIds.has(sc.id);
                        return (
                          <button
                            key={sc.id}
                            onClick={() => {
                              setSelectedComparisonIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(sc.id)) next.delete(sc.id);
                                else if (next.size < 5) next.add(sc.id);
                                return next;
                              });
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors w-full cursor-pointer",
                              isSelected
                                ? "bg-gold/10 border-gold/50 text-foreground ring-1 ring-gold/20"
                                : "border-border bg-card text-foreground hover:border-gold/30"
                            )}
                          >
                            {/* Checkbox */}
                            <div className={cn(
                              "size-5 rounded border-2 shrink-0 grid place-items-center transition-colors",
                              isSelected
                                ? "bg-gold border-gold"
                                : "border-muted-foreground/50"
                            )}>
                              {isSelected && <Check className="size-3.5 text-gold-foreground" />}
                            </div>
                            <GitCompareArrows className={cn("size-4 shrink-0", isSelected ? "text-gold" : "text-muted-foreground")} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                {competitors.find((c) => c.id === mainBrandId)?.page_name} vs {otherBrands.join(", ")}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-medium text-gold bg-gold/15 px-1.5 py-0.5 rounded">
                                  Meta Ads
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(sc.updated_at).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                                {sc.stale && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gold">
                                    <AlertTriangle className="size-2.5" /> {t("report", "stale")}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/50">
                                  {["Tech", sc.hasCopy ? "Copy" : null, sc.hasVisual ? "Visual" : null].filter(Boolean).join(" + ")}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Step {N}: Content Sections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            4. {t("report", "contentSelection")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            {t("report", "selectSections")}
          </p>
          {([
            { key: 'technical' as const, label: t("report", "sectionTechnical") },
            { key: 'copy' as const, label: t("report", "sectionCopy") },
            { key: 'visual' as const, label: t("report", "sectionVisual") },
            { key: 'benchmark' as const, label: t("report", "sectionBenchmark") },
          ]).map((section) => (
            <label
              key={section.key}
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={contentSections.has(section.key)}
                onChange={() => {
                  setContentSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.key)) {
                      // Don't allow unchecking the last section
                      if (next.size > 1) next.delete(section.key);
                    } else {
                      next.add(section.key);
                    }
                    return next;
                  });
                }}
                className="rounded border-border accent-gold"
              />
              <span className="text-sm">{section.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Step 4: Template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            5. {t("report", "template")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template options — saved first, standard last */}
          <div className="space-y-2">
            {/* Saved templates */}
            {filteredTemplates.map((tmpl) => (
              <div key={tmpl.id} className="flex items-center gap-2">
                <button
                  onClick={() => setTemplateId(tmpl.id)}
                  className={cn(
                    "flex-1 flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer",
                    templateId === tmpl.id
                      ? "bg-gold/10 border-gold/50 ring-1 ring-gold/20"
                      : "border-border hover:border-gold/30"
                  )}
                >
                  <div className={cn(
                    "size-5 rounded border-2 shrink-0 grid place-items-center transition-colors",
                    templateId === tmpl.id ? "bg-gold border-gold" : "border-muted-foreground/50"
                  )}>
                    {templateId === tmpl.id && <Check className="size-3.5 text-gold-foreground" />}
                  </div>
                  <span className="text-sm font-medium">{tmpl.name}</span>
                </button>
                <button
                  onClick={() => handleDeleteTemplate(tmpl.id)}
                  className="size-8 rounded-md border border-border hover:border-red-400/40 grid place-items-center text-muted-foreground hover:text-red-400 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            {/* Standard template */}
            <button
              onClick={() => setTemplateId(null)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer",
                !templateId
                  ? "bg-gold/10 border-gold/50 ring-1 ring-gold/20"
                  : "border-border hover:border-gold/30"
              )}
            >
              <div className={cn(
                "size-5 rounded border-2 shrink-0 grid place-items-center transition-colors",
                !templateId ? "bg-gold border-gold" : "border-muted-foreground/50"
              )}>
                {!templateId && <Check className="size-3.5 text-gold-foreground" />}
              </div>
              <span className="text-sm font-medium">Template standard</span>
            </button>
          </div>

          {/* Upload section — available anytime, independent of brand pick */}
          {!showUpload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowUpload(true);
                setUploadClientId(selectedClientId ?? "");
              }}
              className="gap-1.5"
              disabled={clients.length === 0}
              title={
                clients.length === 0
                  ? t("report", "uploadNoClients")
                  : undefined
              }
            >
              <Upload className="size-3.5" />
              {t("report", "uploadTemplate")}
            </Button>
          )}

          {showUpload && (
            <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-xs font-medium">{t("report", "uploadTemplate")}</p>
                <button
                  onClick={() => {
                    setShowUpload(false);
                    setUploadName("");
                    setUploadFile(null);
                    setUploadClientId("");
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">
                    {t("report", "templateClient")} <span className="text-red-400">*</span>
                  </Label>
                  <select
                    value={uploadClientId}
                    onChange={(e) => setUploadClientId(e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-gold/50"
                  >
                    <option value="" className="bg-card">
                      {t("report", "templateClientPlaceholder")}
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-card">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">
                    {t("report", "templateName")} <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Es. Brand Template Q1"
                    className="h-9"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">
                    File (.pptx) <span className="text-red-400">*</span>
                  </Label>
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pptx"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                      id="template-file-input"
                    />
                    {uploadFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="size-4 text-gold" />
                        <span className="text-sm">{uploadFile.name}</span>
                        <button
                          onClick={() => {
                            setUploadFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="template-file-input"
                        className="cursor-pointer space-y-1"
                      >
                        <Upload className="size-5 text-muted-foreground mx-auto" />
                        <p className="text-xs text-muted-foreground">
                          Clicca per selezionare un file PPTX
                        </p>
                      </label>
                    )}
                  </div>
                </div>

                <Button
                  className="w-full gap-1.5"
                  disabled={
                    !uploadFile ||
                    !uploadName.trim() ||
                    !uploadClientId ||
                    uploading
                  }
                  onClick={handleUploadTemplate}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {uploading ? "Caricamento..." : t("report", "uploadBtn")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            6. {t("report", "language")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={reportLocale === "it" ? "default" : "outline"}
              size="sm"
              onClick={() => setReportLocale("it")}
            >
              IT
            </Button>
            <Button
              variant={reportLocale === "en" ? "default" : "outline"}
              size="sm"
              onClick={() => setReportLocale("en")}
            >
              EN
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 6: Font */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            7. {t("report", "font")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFontFamily(f.value)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  fontFamily === f.value
                    ? "bg-gold/15 text-gold border-gold/40"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-gold/30"
                )}
              >
                <span className="text-sm font-medium" style={{ fontFamily: f.value }}>
                  {f.label}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: f.value }}>
                  {f.preview}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 7: Format */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            8. {t("report", "format")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={format === "pptx" ? "default" : "outline"}
              size="sm"
              onClick={() => setFormat("pptx")}
              className="gap-1.5"
            >
              <FileText className="size-3.5" />
              PPTX
            </Button>
            <Button
              variant={format === "pdf" ? "default" : "outline"}
              size="sm"
              onClick={() => setFormat("pdf")}
              className="gap-1.5"
            >
              <FileDown className="size-3.5" />
              PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scanning overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Card className="w-80">
            <CardContent className="py-8 space-y-4">
              <PageLoader className="!min-h-0" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">{t("report", "scanningBrands")}</p>
                <p className="text-xs text-muted-foreground">{t("report", "scanningWait")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Missing data prompt */}
      {missingBrands.length > 0 && !scanning && (
        <Card className="border-gold/30">
          <CardContent className="py-6 text-center space-y-4">
            <AlertTriangle className="size-8 text-gold mx-auto" />
            <div>
              <p className="text-sm font-medium">{t("report", "noDataForChannel")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {missingBrands.join(", ")} — {channel === "google" ? "Google Ads" : channel === "instagram" ? "Instagram" : "Meta Ads"}
              </p>
            </div>
            <Button onClick={handleScanMissing} className="gap-2">
              <Loader2 className="size-4" />
              {t("report", "scanAndGenerate")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generate */}
      <Card className={cn(canGenerate && !missingBrands.length && "border-gold/30")}>
        <CardContent className="py-6">
          <Button
            size="lg"
            disabled={!canGenerate || generating || missingBrands.length > 0}
            onClick={handleGenerate}
            className="w-full gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("report", "generating")}
              </>
            ) : generated ? (
              <>
                <Check className="size-4" />
                {t("report", "generated")}
              </>
            ) : (
              <>
                <FileText className="size-4" />
                {t("report", "generateBtn")}
              </>
            )}
          </Button>

          {/* Progress indicator */}
          {generating && (
            <div className="mt-4 space-y-3">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className={progress >= 10 ? "text-gold" : ""}>
                  {progress >= 10 ? "~" : ""} {locale === "it" ? "Raccolta dati" : "Collecting data"}
                </span>
                <span className={progress >= 40 ? "text-gold" : ""}>
                  {progress >= 40 ? "~" : ""} {locale === "it" ? "Analisi" : "Analysis"}
                </span>
                <span className={progress >= 70 ? "text-gold" : ""}>
                  {progress >= 70 ? "~" : ""} {locale === "it" ? "Generazione file" : "Building file"}
                </span>
                <span className="font-medium">{Math.round(Math.min(progress, 100))}%</span>
              </div>
            </div>
          )}

          {generated && (
            <p className="text-xs text-green-400 text-center mt-2">
              {t("report", "downloadReady")}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 text-center mt-2">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
