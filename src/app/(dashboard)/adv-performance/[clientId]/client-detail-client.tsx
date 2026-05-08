"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { formatDate } from "@/lib/utils";
import { UploadModal } from "./upload-modal";
import type { PerfImportListItem } from "@/types/perf";

export function ClientDetailClient({
  clientId,
  clientName,
  initialImports,
}: {
  clientId: string;
  clientName: string;
  initialImports: PerfImportListItem[];
}) {
  const router = useRouter();
  const { t } = useT();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  return (
    <>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {clientName}
        </h2>
        <Button
          type="button"
          size="sm"
          onClick={() => setUploadOpen(true)}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          {t("advPerformance", "uploadCta")}
        </Button>
      </div>

      {initialImports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("advPerformance", "noImportsYet")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {initialImports.map((imp) => {
            const isDeleting = deletingId === imp.id;
            const isFailed = imp.status === "failed";
            return (
              <Card
                key={imp.id}
                className={
                  isFailed
                    ? "border-red-400/40"
                    : "hover:border-gold/40 transition-colors"
                }
              >
                <CardContent className="p-4 flex items-center gap-4">
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
                          className="text-[9px] text-red-400 border-red-400/40"
                        >
                          failed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                      <span>
                        {imp.row_count} {t("advPerformance", "summaryRows").toLowerCase()}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        {imp.total_spend.toLocaleString()}{" "}
                        {imp.currency ?? ""}
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
                        href={`/adv-performance/${clientId}/${imp.id}`}
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
                      className="size-8 p-0 text-muted-foreground hover:text-red-400"
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
      )}

      <UploadModal
        clientId={clientId}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </>
  );
}
