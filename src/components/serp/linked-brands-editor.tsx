"use client";

/**
 * Editor inline per i brand collegati a una SERP query. Senza
 * questo componente l'unico modo di rimuovere un brand-link
 * sbagliato (es. associazione "marina rinaldi → Marc Cain"
 * occorsa per pre-select via ?brandId in URL) era cancellare la
 * query e ricrearla — il PATCH endpoint /api/serp/queries/[id]
 * con `competitor_ids` esisteva gia' ma non aveva UI.
 *
 * Render: chip rimovibili per i linked + popover "+ Add" che
 * apre la lista degli unlinked.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BrandRef {
  id: string;
  page_name: string;
  google_domain: string | null;
}

interface Props {
  queryId: string;
  initialLinkedIds: string[];
  allCompetitors: BrandRef[];
  labels: {
    title: string;
    addBrand: string;
    noneLinked: string;
    saveError: string;
    removed: string;
    added: string;
  };
}

export function LinkedBrandsEditor({
  queryId,
  initialLinkedIds,
  allCompetitors,
  labels,
}: Props) {
  const router = useRouter();
  const [linkedIds, setLinkedIds] = useState<string[]>(initialLinkedIds);
  const [isPending, startTransition] = useTransition();
  const [showPicker, setShowPicker] = useState(false);

  const linkedBrands = linkedIds
    .map((id) => allCompetitors.find((c) => c.id === id))
    .filter((c): c is BrandRef => !!c);

  const unlinkedBrands = allCompetitors.filter(
    (c) => !linkedIds.includes(c.id),
  );

  async function persist(nextIds: string[]) {
    const prev = linkedIds;
    setLinkedIds(nextIds);
    startTransition(async () => {
      const res = await fetch(`/api/serp/queries/${queryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_ids: nextIds }),
      });
      if (!res.ok) {
        setLinkedIds(prev); // rollback ottimistico
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? labels.saveError);
        return;
      }
      router.refresh();
    });
  }

  function removeBrand(id: string) {
    const next = linkedIds.filter((x) => x !== id);
    persist(next);
    toast.success(labels.removed);
  }

  function addBrand(id: string) {
    const next = [...linkedIds, id];
    persist(next);
    setShowPicker(false);
    toast.success(labels.added);
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
        {labels.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {linkedBrands.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            {labels.noneLinked}
          </span>
        )}
        {linkedBrands.map((b) => (
          <Badge
            key={b.id}
            variant="gold"
            className="text-[10px] gap-1 pr-1"
          >
            {b.page_name}
            <button
              type="button"
              onClick={() => removeBrand(b.id)}
              disabled={isPending}
              aria-label={`Remove ${b.page_name}`}
              className="size-3.5 grid place-items-center rounded hover:bg-gold/20 transition-colors disabled:opacity-50"
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
        {unlinkedBrands.length > 0 && (
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPicker((s) => !s)}
              disabled={isPending}
              className="h-6 text-[10px] gap-1 px-2"
            >
              <Plus className="size-3" />
              {labels.addBrand}
            </Button>
            {showPicker && (
              <div className="absolute z-20 mt-1 left-0 w-64 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                <ul className="py-1">
                  {unlinkedBrands.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => addBrand(c.id)}
                        disabled={isPending}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        <span className="font-medium">{c.page_name}</span>
                        {c.google_domain && (
                          <span className="text-[10px] text-muted-foreground/70 ml-2">
                            {c.google_domain}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
