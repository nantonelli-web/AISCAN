"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ExportPptxButton — scarica un PowerPoint del dashboard import.
 * Async: la generazione lato server impiega 5-15s a seconda del
 * numero di sezioni e analisi AI presenti.
 */
export function ExportPptxButton({ importId }: { importId: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/perf/imports/${importId}/export/pptx`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(`Export fallito${txt ? `: ${txt.slice(0, 120)}` : ""}`);
        return;
      }
      const blob = await res.blob();
      // Estrai il filename dal content-disposition
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? "adv-performance.pptx";
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PowerPoint scaricato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore export");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={download}
      disabled={busy}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
      Esporta PPTX
    </Button>
  );
}
