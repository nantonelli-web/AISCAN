"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  AlertTriangle,
  Check,
  X,
  UploadCloud,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";
import { CURRENCY_OPTIONS } from "@/lib/perf/currencies";
import type { PerfDiagnostic } from "@/types/perf";

type Channel = "meta" | "google" | "tiktok" | "snapchat";
type SaveMode = "append" | "replace";
type Step = "pick" | "validating" | "review" | "saving";

interface SummaryPreview {
  rowCount: number;
  totalSpend: number;
  totalImpressions: number;
  uniqueCampaigns: number;
}

export function UploadModal({
  clientId,
  brandId,
  open,
  presetFile,
  onClose,
}: {
  clientId: string;
  brandId: string;
  open: boolean;
  presetFile?: File | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<Channel>("meta");
  const [mode, setMode] = useState<SaveMode>("append");
  // Currency manuale per channel che non includono il codice
  // valuta nei header (Snapchat e altri canali futuri).
  const [currencyOverride, setCurrencyOverride] = useState("AED");
  const [step, setStep] = useState<Step>("pick");
  const [dragActive, setDragActive] = useState(false);
  // Validation result kept for confirm step
  const [validationResult, setValidationResult] = useState<{
    importId: string | null;
    diagnostics: PerfDiagnostic[];
    summary: SummaryPreview;
    periodFrom: string | null;
    periodTo: string | null;
    currency: string | null;
    filePath: string;
    fileFormat: "csv" | "xlsx";
    fileName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Quando l'utente apre il modal con un file gia' droppato (drag
  // dall'empty state) lo pre-popoliamo cosi puo confermare
  // direttamente.
  useEffect(() => {
    if (open && presetFile) setFile(presetFile);
  }, [open, presetFile]);

  function reset() {
    setFile(null);
    setStep("pick");
    setValidationResult(null);
    setError(null);
  }

  async function uploadAndValidate() {
    if (!file) return;
    const fileFormat: "csv" | "xlsx" = /\.xlsx$/i.test(file.name)
      ? "xlsx"
      : "csv";

    setStep("validating");
    setError(null);
    try {
      // 1. Get signed upload URL
      const urlRes = await fetch("/api/perf/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          client_id: clientId,
          channel,
        }),
      });
      const urlJson = (await urlRes.json()) as {
        signedUrl?: string;
        storagePath?: string;
        fileName?: string;
        error?: string;
      };
      if (!urlRes.ok || !urlJson.signedUrl || !urlJson.storagePath) {
        throw new Error(urlJson.error ?? "Failed to get upload URL");
      }

      // 2. Direct upload to Supabase Storage
      const putRes = await fetch(urlJson.signedUrl, {
        method: "PUT",
        headers: {
          "content-type":
            fileFormat === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/csv",
        },
        body: file,
      });
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`Upload failed: ${putRes.status} ${text.slice(0, 100)}`);
      }

      // 3. Trigger parse + validate (NOT save yet — we want the
      // user to confirm). For MVP we use the same /imports POST
      // endpoint and treat 422 as "validation failed", 200 as
      // "imported successfully". To split validate-vs-save we'd
      // need a separate endpoint; for now we save immediately
      // with the chosen mode and show the result.
      const importRes = await fetch("/api/perf/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          brand_id: brandId,
          channel,
          file_path: urlJson.storagePath,
          file_name: urlJson.fileName ?? file.name,
          file_format: fileFormat,
          mode,
          ...(channel === "snapchat" && currencyOverride
            ? { currency_override: currencyOverride.toUpperCase() }
            : {}),
        }),
      });
      const importJson = (await importRes.json()) as {
        ok?: boolean;
        import_id?: string | null;
        diagnostics?: PerfDiagnostic[];
        summary?: SummaryPreview;
        period_from?: string | null;
        period_to?: string | null;
        currency?: string | null;
        error?: string;
      };

      if (importRes.status === 422) {
        // Validation failed — show diagnostics in review step
        setValidationResult({
          importId: importJson.import_id ?? null,
          diagnostics: importJson.diagnostics ?? [],
          summary: importJson.summary ?? {
            rowCount: 0,
            totalSpend: 0,
            totalImpressions: 0,
            uniqueCampaigns: 0,
          },
          periodFrom: importJson.period_from ?? null,
          periodTo: importJson.period_to ?? null,
          currency: importJson.currency ?? null,
          filePath: urlJson.storagePath,
          fileFormat,
          fileName: urlJson.fileName ?? file.name,
        });
        setStep("review");
        return;
      }
      if (!importRes.ok || !importJson.ok || !importJson.import_id) {
        throw new Error(importJson.error ?? "Validation failed");
      }

      // Success — go directly to dashboard
      toast.success(t("advPerformance", "saved"));
      router.push(
        `/ads-analysis/${clientId}/${brandId}/${importJson.import_id}`,
      );
      router.refresh();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setStep("pick");
      toast.error(msg);
    }
  }

  if (!open) return null;

  const errors = validationResult?.diagnostics.filter(
    (d) => d.severity === "error",
  );
  const warnings = validationResult?.diagnostics.filter(
    (d) => d.severity === "warning",
  );
  const infos = validationResult?.diagnostics.filter(
    (d) => d.severity === "info",
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 print:hidden">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                {t("advPerformance", "uploadTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("advPerformance", "uploadDescription")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className="size-8 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label={t("advPerformance", "uploadCancel")}
            >
              <X className="size-4" />
            </button>
          </div>

          {step === "pick" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="perf-channel">
                  {t("advPerformance", "uploadChannelLabel")}
                </Label>
                <select
                  id="perf-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground"
                >
                  <option value="meta">{t("advPerformance", "channelMeta")}</option>
                  <option value="snapchat">
                    {t("advPerformance", "channelSnapchat")}
                  </option>
                  <option value="google" disabled>
                    {t("advPerformance", "channelGoogle")} —{" "}
                    {t("advPerformance", "comingSoon")}
                  </option>
                  <option value="tiktok" disabled>
                    {t("advPerformance", "channelTiktok")} —{" "}
                    {t("advPerformance", "comingSoon")}
                  </option>
                </select>
              </div>

              {channel === "snapchat" && (
                <div className="space-y-2">
                  <Label htmlFor="perf-currency">Valuta</Label>
                  <select
                    id="perf-currency"
                    value={currencyOverride}
                    onChange={(e) =>
                      setCurrencyOverride(e.target.value.toUpperCase())
                    }
                    className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground"
                  >
                    <optgroup label="Piu' usate">
                      {CURRENCY_OPTIONS.filter(
                        (c) => c.group === "primary",
                      ).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Tutte le altre">
                      {CURRENCY_OPTIONS.filter((c) => c.group === "rest").map(
                        (c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ),
                      )}
                    </optgroup>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Il file di questo canale non include il codice
                    valuta. Selezionalo qui.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("advPerformance", "uploadFileLabel")}</Label>
                <label
                  htmlFor="perf-file-drop"
                  className={`block rounded-xl border-2 border-dashed px-5 py-8 text-center cursor-pointer transition-all ${
                    dragActive
                      ? "border-gold bg-amber-500/10"
                      : "border-border hover:border-gold/60 hover:bg-muted/40"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const f = e.dataTransfer.files?.[0];
                    if (!f) return;
                    if (!/\.(csv|xlsx)$/i.test(f.name)) {
                      toast.error("Solo file CSV o XLSX");
                      return;
                    }
                    setFile(f);
                  }}
                >
                  <input
                    id="perf-file-drop"
                    type="file"
                    accept=".csv,.xlsx"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="size-9 rounded-md bg-emerald-500/15 text-emerald-500 grid place-items-center">
                        <FileSpreadsheet className="size-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium truncate max-w-[300px]">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB · click per
                          cambiare
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="size-11 rounded-full bg-gradient-to-br from-amber-500/30 to-sky-500/20 text-amber-600 grid place-items-center mx-auto mb-2">
                        <UploadCloud className="size-5" />
                      </div>
                      <p className="text-sm font-medium">
                        Trascina qui il file o clicca per selezionarlo
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Accetta CSV, XLSX
                      </p>
                    </>
                  )}
                </label>
              </div>

              <div className="space-y-2">
                <Label>{t("advPerformance", "uploadModeLabel")}</Label>
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={mode === "append"}
                      onChange={() => setMode("append")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {t("advPerformance", "uploadModeAppend")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("advPerformance", "uploadModeAppendHint")}
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={mode === "replace"}
                      onChange={() => setMode("replace")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {t("advPerformance", "uploadModeReplace")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("advPerformance", "uploadModeReplaceHint")}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-red-400/40 bg-red-400/5 p-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    reset();
                    onClose();
                  }}
                >
                  {t("advPerformance", "uploadCancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!file}
                  onClick={uploadAndValidate}
                  className="gap-1.5"
                >
                  <Upload className="size-4" />
                  {t("advPerformance", "uploadValidate")}
                </Button>
              </div>
            </>
          )}

          {step === "validating" && (
            <div className="py-12 grid place-items-center text-sm text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin" />
              {t("advPerformance", "uploadValidating")}
            </div>
          )}

          {step === "review" && validationResult && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-2">
                  {t("advPerformance", "diagnosticsTitle")}
                </p>
                {validationResult.diagnostics.length === 0 ? (
                  <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
                    <Check className="size-3.5" />
                    {t("advPerformance", "diagnosticsAllOk")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {errors?.map((d, i) => (
                      <li
                        key={`e-${i}`}
                        className="text-xs text-red-400 flex items-start gap-2"
                      >
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>{d.message}</span>
                      </li>
                    ))}
                    {warnings?.map((d, i) => (
                      <li
                        key={`w-${i}`}
                        className="text-xs text-amber-400 flex items-start gap-2"
                      >
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>{d.message}</span>
                      </li>
                    ))}
                    {infos?.map((d, i) => (
                      <li
                        key={`i-${i}`}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="size-3.5 shrink-0 mt-0.5">·</span>
                        <span>{d.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-2">
                  {t("advPerformance", "summaryTitle")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("advPerformance", "summaryRows")}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {validationResult.summary.rowCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("advPerformance", "summaryCampaigns")}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {validationResult.summary.uniqueCampaigns}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("advPerformance", "summaryDateRange")}
                    </p>
                    <p className="text-xs tabular-nums">
                      {validationResult.periodFrom ?? "—"} →{" "}
                      {validationResult.periodTo ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("advPerformance", "summaryTotalSpend")}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {validationResult.summary.totalSpend.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {validationResult.currency ?? "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reset}
                >
                  {t("advPerformance", "uploadReupload")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
