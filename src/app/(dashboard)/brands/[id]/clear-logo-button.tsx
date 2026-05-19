"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/context";

/**
 * Bottone "Rimuovi logo" piazzato sull'avatar del brand-hero.
 * Setta profile_picture_url=null via PATCH /api/competitors/[id]
 * — al prossimo scan IG/TT/SC/YT lo scan route ripopola
 * profile_picture_url dall'API ufficiale del canale.
 *
 * Reso solo quando l'avatar esiste (page.tsx già nasconde il
 * pulsante se pageProfilePicture e' null).
 */
export function ClearLogoButton({ competitorId }: { competitorId: string }) {
  const router = useRouter();
  const { t } = useT();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleClear() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${competitorId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profile_picture_url: null }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: "Error" }));
          toast.error(json.error ?? "Errore");
          return;
        }
        toast.success(t("editCompetitor", "logoCleared"));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore");
      } finally {
        setConfirmOpen(false);
      }
    });
  }

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title={t("editCompetitor", "removeLogo")}
        className="absolute -top-1 -right-1 size-5 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer grid place-items-center shadow-sm"
        aria-label={t("editCompetitor", "removeLogo")}
      >
        <X className="size-3" />
      </button>
    );
  }
  return (
    <div className="absolute top-full left-0 mt-1 z-10 rounded-md border border-border bg-popover shadow-md p-2 text-xs space-y-1.5 w-44">
      <p className="text-foreground">{t("editCompetitor", "removeLogoConfirm")}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className="px-2 py-1 rounded-md bg-foreground text-background text-[11px] font-medium cursor-pointer hover:opacity-90"
        >
          {isPending ? "…" : t("common", "yes")}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(false)}
          disabled={isPending}
          className="px-2 py-1 rounded-md border border-border text-[11px] font-medium cursor-pointer hover:bg-muted"
        >
          {t("common", "no")}
        </button>
      </div>
    </div>
  );
}
