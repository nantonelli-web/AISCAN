"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronRight,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { formatDate } from "@/lib/utils";
import { UploadModal } from "./upload-modal";
import type { PerfImportListItem } from "@/types/perf";

export function BrandDetailClient({
  clientId,
  brandId,
  brandName,
  initialImports,
}: {
  clientId: string;
  brandId: string;
  brandName: string;
  initialImports: PerfImportListItem[];
}) {
  const router = useRouter();
  const { t } = useT();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [presetFile, setPresetFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  async function deleteImport(id: string) {
    if (!confirm(t("advPerformance", "deleteImportConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/perf/imports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("advPerformance", "deleteImportError"));
        return;
      }
      toast.success(t("advPerformance", "deleted"));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  function openUpload(file?: File | null) {
    if (file) setPresetFile(file);
    setUploadOpen(true);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      toast.error("Solo file CSV o XLSX");
      return;
    }
    openUpload(file);
  }

  const isEmpty = initialImports.length === 0;

  return (
    <>
      {isEmpty ? (
        <Card
          className={`border-dashed transition-colors ${
            dragActive ? "border-gold/60 bg-amber-500/5" : ""
          }`}
        >
          <CardContent className="p-8 sm:p-12 space-y-6">
            <div className="grid sm:grid-cols-[1fr_minmax(0,1.2fr)] gap-8 items-center">
              <div className="space-y-3">
                <div className="size-14 rounded-2xl bg-amber-500/10 text-amber-500 grid place-items-center">
                  <Sparkles className="size-7" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("advPerformance", "uploadHeroTitle").replace(
                    "{brand}",
                    brandName,
                  )}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("advPerformance", "uploadHeroBody")}
                </p>
              </div>
              <label
                htmlFor="perf-drop-file"
                className={`block rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all ${
                  dragActive
                    ? "border-gold bg-amber-500/10"
                    : "border-border hover:border-gold/60 hover:bg-muted/40"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <input
                  id="perf-drop-file"
                  type="file"
                  accept=".csv,.xlsx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openUpload(f);
                  }}
                />
                <div className="size-12 rounded-full bg-gradient-to-br from-amber-500/30 to-sky-500/20 text-amber-600 grid place-items-center mx-auto mb-3">
                  <UploadCloud className="size-6" />
                </div>
                <p className="text-sm font-medium">
                  {t("advPerformance", "uploadDropHint")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("advPerformance", "uploadDropFormats")}
                </p>
              </label>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 print:hidden">
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {t("advPerformance", "importsListTitle")}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">
                {t("advPerformance", "importsListSubtitle")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => openUpload()}
              className="gap-1.5 shrink-0"
            >
              <Plus className="size-4" />
              {t("advPerformance", "quickUpload")}
            </Button>
          </div>

          <div className="space-y-2">
            {initialImports.map((imp) => {
              const isDeleting = deletingId === imp.id;
              const isFailed = imp.status === "failed";
              return (
                <Card
                  key={imp.id}
                  className={
                    isFailed
                      ? "border-rose-400/40"
                      : "hover:border-gold/40 transition-colors"
                  }
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="size-10 rounded-md bg-amber-500/10 text-amber-500 grid place-items-center shrink-0">
                      <FileSpreadsheet className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {imp.channel}
                        </Badge>
                        <p className="text-sm font-medium tabular-nums">
                          {formatDate(imp.period_from)} →{" "}
                          {formatDate(imp.period_to)}
                        </p>
                        {isFailed && (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-rose-400 border-rose-400/40"
                          >
                            failed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        <span>
                          {imp.row_count}{" "}
                          {t("advPerformance", "summaryRows").toLowerCase()}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>
                          {imp.total_spend.toLocaleString()} {imp.currency ?? ""}
                        </span>
                        {imp.file_name && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="truncate max-w-[200px]">
                              {imp.file_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                      {!isFailed && (
                        <Link
                          href={`/adv-performance/${clientId}/${brandId}/${imp.id}`}
                          className="size-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label="Open dashboard"
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteImport(imp.id)}
                        disabled={isDeleting}
                        className="size-8 p-0 text-muted-foreground hover:text-rose-400"
                      >
                        {isDeleting ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <UploadModal
        clientId={clientId}
        brandId={brandId}
        open={uploadOpen}
        presetFile={presetFile}
        onClose={() => {
          setUploadOpen(false);
          setPresetFile(null);
        }}
      />
    </>
  );
}
