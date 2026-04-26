"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

/**
 * In-place destructive action for the brand detail header. The full
 * delete UX also lives in /competitors/[id]/edit, but most users hit
 * the brand page first and not the edit page — having the button here
 * cuts a navigation step. Confirmation is inline so we never delete
 * from a single click.
 */
export function DeleteBrandButton({
  competitorId,
  competitorName,
  counts,
}: {
  competitorId: string;
  competitorName: string;
  counts: {
    ads: number;
    posts: number;
    jobs: number;
    comparisons: number;
  };
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
      router.push("/competitors");
      router.refresh();
    } catch {
      toast.error(t("editCompetitor", "deleteError"), { id: toastId });
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
        title={t("editCompetitor", "deleteBtn")}
        aria-label={t("editCompetitor", "deleteBtn")}
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
      <div className="w-full max-w-md rounded-lg border border-red-400/30 bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {t("editCompetitor", "deleteConfirm")}{" "}
            <span className="text-red-400">{competitorName}</span>?
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("editCompetitor", "deleteWarning")}
          </p>
        </div>
        {(counts.ads > 0 ||
          counts.posts > 0 ||
          counts.jobs > 0 ||
          counts.comparisons > 0) && (
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
            {counts.ads > 0 && (
              <li>
                <b className="text-foreground">{counts.ads}</b>{" "}
                {t("editCompetitor", "deleteCountAds")}
              </li>
            )}
            {counts.posts > 0 && (
              <li>
                <b className="text-foreground">{counts.posts}</b>{" "}
                {t("editCompetitor", "deleteCountPosts")}
              </li>
            )}
            {counts.jobs > 0 && (
              <li>
                <b className="text-foreground">{counts.jobs}</b>{" "}
                {t("editCompetitor", "deleteCountJobs")}
              </li>
            )}
            {counts.comparisons > 0 && (
              <li>
                <b className="text-foreground">{counts.comparisons}</b>{" "}
                {t("editCompetitor", "deleteCountComparisons")}
              </li>
            )}
          </ul>
        )}
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => setConfirming(false)}
          >
            {t("editCompetitor", "cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting
              ? t("editCompetitor", "deletingProgress")
              : t("editCompetitor", "confirmDelete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
