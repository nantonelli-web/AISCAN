"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

/**
 * Lightweight delete control for the Brands list cards.
 *
 * The brand-detail page already ships the full DeleteBrandButton with
 * counts of ads/posts/jobs/comparisons that will be removed. On the
 * list view we don't have those counts pre-computed for every card
 * (that would be N extra queries on a page that already runs three),
 * so this slim variant just fires a plain confirm modal — the user
 * has chosen the brand explicitly, the destructive copy and red
 * confirm button keep them honest. Same DELETE endpoint underneath.
 */
export function BrandCardDeleteButton({
  competitorId,
  competitorName,
}: {
  competitorId: string;
  competitorName: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onConfirm() {
    setDeleting(true);
    const toastId = toast.loading(t("editCompetitor", "deletingProgress"));
    try {
      const res = await fetch(`/api/competitors/${competitorId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("editCompetitor", "deleteError"), { id: toastId });
        setDeleting(false);
        return;
      }
      toast.success(t("editCompetitor", "deleted"), { id: toastId });
      setConfirming(false);
      router.refresh();
    } catch {
      toast.error(t("editCompetitor", "deleteError"), { id: toastId });
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        className="size-7 rounded-md border border-border hover:bg-red-400/10 hover:border-red-400/40 grid place-items-center text-muted-foreground hover:text-red-400 transition-colors pointer-events-auto"
        title={t("editCompetitor", "deleteBtn")}
        aria-label={t("editCompetitor", "deleteBtn")}
      >
        <Trash2 className="size-3.5" />
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 print:hidden"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!deleting) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-red-400/30 bg-card p-5 space-y-4"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {t("editCompetitor", "deleteConfirm")}{" "}
                <span className="text-red-400">{competitorName}</span>?
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("editCompetitor", "deleteWarning")}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirming(false);
                }}
              >
                {t("editCompetitor", "cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onConfirm();
                }}
              >
                {deleting
                  ? t("editCompetitor", "deletingProgress")
                  : t("editCompetitor", "confirmDelete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
