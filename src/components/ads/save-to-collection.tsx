"use client";

import { useState, useEffect } from "react";
import { Bookmark, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";

interface Collection {
  id: string;
  name: string;
  adCount: number;
}

export function SaveToCollection({ adId }: { adId: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedIn, setSavedIn] = useState<Set<string>>(new Set());
  const { t } = useT();

  useEffect(() => {
    if (open) {
      fetch("/api/collections")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setCollections(d);
        });
    }
  }, [open]);

  async function addToCollection(collId: string) {
    const res = await fetch(`/api/collections/${collId}/ads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ad_id: adId }),
    });
    if (res.ok) {
      setSavedIn((prev) => new Set([...prev, collId]));
      toast.success(t("saveCollection", "adSaved"));
    } else {
      toast.error(t("saveCollection", "saveError"));
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error);
      setLoading(false);
      return;
    }
    await addToCollection(json.id);
    setCollections((prev) => [
      { id: json.id, name: newName.trim(), adCount: 1 },
      ...prev,
    ]);
    setNewName("");
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="size-8 rounded-md border border-border bg-card/80 backdrop-blur hover:bg-muted hover:border-gold/40 grid place-items-center text-muted-foreground hover:text-gold transition-colors"
        title={t("saveCollection", "title")}
      >
        <Bookmark className="size-3.5" />
      </button>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="absolute top-2 left-2 z-10 w-56 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{t("saveCollection", "title")}</p>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>

      <div className="max-h-32 overflow-y-auto space-y-1">
        {collections.map((c) => {
          const isSaved = savedIn.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => !isSaved && addToCollection(c.id)}
              disabled={isSaved}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors disabled:opacity-50"
            >
              <span className="truncate">{c.name}</span>
              {isSaved ? (
                <Check className="size-3 text-gold shrink-0" />
              ) : (
                <span className="text-muted-foreground shrink-0">
                  {c.adCount}
                </span>
              )}
            </button>
          );
        })}
        {collections.length === 0 && (
          <p className="text-[10px] text-muted-foreground py-2 text-center">
            {t("saveCollection", "noCollections")}
          </p>
        )}
      </div>

      <div className="flex gap-1.5 pt-1 border-t border-border">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("saveCollection", "newCollectionPlaceholder")}
          className="text-xs h-7"
          onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
        />
        <Button
          size="sm"
          className="h-7 px-2"
          onClick={createAndAdd}
          disabled={loading || !newName.trim()}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
