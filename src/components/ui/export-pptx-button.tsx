"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ExportPptxButton — bottone download PowerPoint generico.
 * Accetta una `endpoint` URL (GET) che ritorni un .pptx.
 * Loading state, toast success/error, trigger download tramite
 * blob + content-disposition filename.
 *
 * Usato in:
 *  - dashboard Adv Performance (file specifico)
 *  - pagina Compare brand (comparison salvata)
 *  - pagina Benchmarks (filtri correnti via query string)
 */
export function ExportPptxButton({
  endpoint,
  disabled,
  label = "Esporta PPTX",
  variant = "outline",
  size = "sm",
}: {
  endpoint: string;
  disabled?: boolean;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(`Export fallito${txt ? `: ${txt.slice(0, 120)}` : ""}`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? "export.pptx";
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
      variant={variant}
      size={size}
      onClick={download}
      disabled={busy || disabled}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
      {label}
    </Button>
  );
}
