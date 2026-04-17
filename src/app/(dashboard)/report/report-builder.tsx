"use client";

/* eslint-disable @next/next/no-page-custom-font */
import { useState, useRef } from "react";
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
}

type ReportType = "single" | "comparison";
type ReportChannel = "meta" | "google" | "instagram";
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
  clients: _clients,
  templates: initialTemplates,
  savedComparisons = [],
}: {
  competitors: MaitCompetitor[];
  clients: ClientRecord[];
  templates: TemplateRecord[];
  savedComparisons?: SavedComparison[];
}) {
  void _clients; // clients list available for future use
  const { t, locale } = useT();

  // State
  const [reportType, setReportType] = useState<ReportType>("single");
  const [channel, setChannel] = useState<ReportChannel>("meta");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [reportLocale, setReportLocale] = useState<ReportLocale>(locale as ReportLocale);
  const [contentSections, setContentSections] = useState<Set<'technical' | 'copy' | 'visual'>>(new Set(['technical']));
  const [fontFamily, setFontFamily] = useState("Inter");
  const [format, setFormat] = useState<ReportFormat>("pptx");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRecord[]>(initialTemplates);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived values
  const selectedArray = [...selectedBrands];
  const maxBrands = reportType === "comparison" ? 3 : 1;
  // Step numbering: channel is step 2, saved comparisons adds another step
  const hasCompStep = reportType === "comparison" && savedComparisons.length > 0;
  // +1 for channel step, +1 for saved comparisons (if visible)
  const stepOffset = 1 + (hasCompStep ? 1 : 0);

  // Get client_id for the first selected brand (for template filtering)
  const firstBrand = competitors.find((c) => selectedBrands.has(c.id));
  const selectedClientId = firstBrand?.client_id ?? null;
  const filteredTemplates = selectedClientId
    ? templates.filter((t) => t.client_id === selectedClientId)
    : templates; // Show all templates if no client selected

  const selectedTemplate = templateId
    ? templates.find((t) => t.id === templateId)
    : null;

  // Can generate?
  const canGenerate =
    reportType === "single"
      ? selectedBrands.size === 1
      : selectedBrands.size >= 2;

  // ─── Handlers ────────────────────────────────────────────────

  function toggleBrand(id: string) {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (reportType === "single") {
          // Single: only one selection
          next.clear();
          next.add(id);
        } else if (next.size < maxBrands) {
          next.add(id);
        }
      }
      return next;
    });
    // Reset template when brand changes
    setTemplateId(null);
  }

  function switchType(type: ReportType) {
    setReportType(type);
    setSelectedBrands(new Set());
    setTemplateId(null);
    setChannel("meta");
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerated(false);
    setError(null);

    try {
      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: reportType,
          channel,
          competitor_ids: selectedArray,
          template_id: templateId ?? undefined,
          format,
          locale: reportLocale,
          sections: [...contentSections],
          font_family: fontFamily,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Generation failed");
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

      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report", "errorGeneration"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleUploadTemplate() {
    if (!uploadFile || !uploadName.trim()) return;
    const clientIdForUpload = selectedClientId;
    if (!clientIdForUpload) {
      setError("Seleziona un brand assegnato a un cliente per caricare un template.");
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
      console.log("[MAIT template] Step 1 OK — signed URL:", signedUrl?.slice(0, 80));

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
        console.error("[MAIT template] Step 2 FAILED:", uploadRes.status, errText);
        throw new Error(`Storage upload failed: ${uploadRes.status} ${errText.slice(0, 200)}`);
      }
      console.log("[MAIT template] Step 2 OK — file uploaded to:", storagePath);

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
      console.log("[MAIT template] Step 3 OK — record saved:", record.id, record.name);
      setTemplates((prev) => [record, ...prev]);
      setTemplateId(record.id);
      setShowUpload(false);
      setUploadName("");
      setUploadFile(null);
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
              variant={reportType === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => switchType("single")}
            >
              {t("report", "typeSingle")}
            </Button>
            <Button
              variant={reportType === "comparison" ? "default" : "outline"}
              size="sm"
              onClick={() => switchType("comparison")}
            >
              {t("report", "typeComparison")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Channel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            2. {t("report", "channel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={channel === "meta" ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel("meta")}
              className="gap-1.5"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
              </svg>
              Meta Ads
            </Button>
            <Button
              variant={channel === "google" ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel("google")}
              className="gap-1.5"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
                <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
              </svg>
              Google Ads
            </Button>
            <Button
              variant={channel === "instagram" ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel("instagram")}
              className="gap-1.5"
            >
              <InstagramIcon className="size-4" />
              Instagram
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Saved comparisons (only for comparison mode) */}
      {reportType === "comparison" && savedComparisons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              3. {t("report", "savedComparisons")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              {t("report", "savedComparisonsHint")}
            </p>
            <div className="grid gap-2">
              {savedComparisons.map((sc) => {
                // Resolve brand names from competitor IDs
                const brandNames = sc.competitor_ids
                  .map((id) => competitors.find((c) => c.id === id)?.page_name)
                  .filter(Boolean);
                // Skip comparisons whose brands are not in the current workspace
                if (brandNames.length !== sc.competitor_ids.length) return null;

                const isActive =
                  sc.competitor_ids.length === selectedBrands.size &&
                  sc.competitor_ids.every((id) => selectedBrands.has(id));

                return (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setSelectedBrands(new Set(sc.competitor_ids));
                      setTemplateId(null);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors w-full",
                      isActive
                        ? "bg-gold/15 border-gold/40 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-gold/30"
                    )}
                  >
                    <GitCompareArrows className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-gold" : "text-muted-foreground"
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {brandNames.join(" vs ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        {new Date(sc.updated_at).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {sc.stale && (
                          <span className="inline-flex items-center gap-0.5 text-amber-400">
                            <AlertTriangle className="size-2.5" />
                            {t("report", "stale")}
                          </span>
                        )}
                        <span className="text-muted-foreground/50">
                          {[
                            "Tech",
                            sc.hasCopy ? "Copy" : null,
                            sc.hasVisual ? "Visual" : null,
                          ].filter(Boolean).join(" + ")}
                        </span>
                      </span>
                    </div>
                    {isActive && <Check className="size-3.5 text-gold shrink-0" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step {N}: Select Brand(s) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {reportType === "comparison" && savedComparisons.length > 0 ? "4" : "3"}.{" "}
            {reportType === "single"
              ? t("report", "selectBrand")
              : t("report", "selectBrands")}
            {reportType === "comparison" && ` (${selectedBrands.size}/${maxBrands})`}
          </CardTitle>
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
                  disabled={
                    !isSelected && selectedBrands.size >= maxBrands
                  }
                >
                  {c.page_name}
                </Button>
              );
            })}
          </div>
          {competitors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("compare", "noCompetitorsInWorkspace")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Content Sections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {3 + stepOffset}. {t("report", "contentSelection")}
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
            {4 + stepOffset}. {t("report", "template")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template selection */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={!templateId ? "default" : "outline"}
              size="sm"
              onClick={() => setTemplateId(null)}
            >
              {t("report", "defaultStyle")}
            </Button>
            {filteredTemplates.map((tmpl) => (
              <div key={tmpl.id} className="flex items-center gap-1">
                <Button
                  variant={templateId === tmpl.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTemplateId(tmpl.id)}
                >
                  {tmpl.name}
                </Button>
                <button
                  onClick={() => handleDeleteTemplate(tmpl.id)}
                  className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                  title={t("report", "templateDeleted")}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Status message */}
          {selectedTemplate && (
            <p className="text-xs text-gold">
              {t("report", "usingTemplate")}: {selectedTemplate.name}
            </p>
          )}
          {!templateId && (
            <p className="text-xs text-muted-foreground">
              {t("report", "noTemplate")}
            </p>
          )}

          {/* Upload section */}
          {selectedBrands.size > 0 && (
            <>
              {!showUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUpload(true)}
                  className="gap-1.5"
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
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
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
                      disabled={!uploadFile || !uploadName.trim() || uploading}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {5 + stepOffset}. {t("report", "language")}
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
            {6 + stepOffset}. {t("report", "font")}
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
            {7 + stepOffset}. {t("report", "format")}
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

      {/* Generate */}
      <Card className={cn(canGenerate && "border-gold/30")}>
        <CardContent className="py-6">
          <Button
            size="lg"
            disabled={!canGenerate || generating}
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
