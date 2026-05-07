"use client";

/**
 * Pannello aggregato dei collaboratori ricorrenti per un brand.
 * Mostra i top N account taggati/menzionati nei post organic
 * (esclusi auto-tag del brand stesso) ordinati per frequenza.
 *
 * Il signal pratico: account che compaiono N volte = ambassador
 * strutturali (collab continuativa); account con count=1 = collab
 * one-shot. La distinzione brand-vs-influencer-vs-VIP e' Livello 2
 * (parcheggiata in project_open_followups.md), qui li elenchiamo
 * tutti con frequenza.
 */

import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import type { CollabFrequency } from "@/lib/organic/collaborations";

const TIKTOK_LABEL = "TikTok";
const IG_LABEL = "Instagram";

export function TopCollaboratorsPanel({
  collaborators,
  totalCollabPosts,
  totalPosts,
}: {
  /** Gia' ordinati per count desc dal server. */
  collaborators: CollabFrequency[];
  /** Quanti post nel set hanno almeno un account esterno (= sono collab). */
  totalCollabPosts: number;
  /** Total posts considered (denominatore). */
  totalPosts: number;
}) {
  const { t } = useT();
  if (collaborators.length === 0 || totalPosts === 0) {
    return null;
  }
  const collabRate =
    totalPosts > 0 ? Math.round((totalCollabPosts / totalPosts) * 100) : 0;
  const top = collaborators.slice(0, 12);
  const maxCount = top[0]?.count ?? 1;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {t("organic", "topCollabsTitle")}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({collaborators.length})
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t("organic", "topCollabsDescription")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-1">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {totalCollabPosts}
              <span className="text-base text-muted-foreground font-normal">
                {" "}
                /{totalPosts}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "collabPosts")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {collabRate}%
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "collabRate")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {collaborators.filter((c) => c.count >= 2).length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "recurringCollabs")}
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {collaborators.filter((c) => c.count === 1).length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("organic", "oneShotCollabs")}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 pt-1">
          {top.map((c) => (
            <div key={c.handle} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground truncate">
                    @{c.handle}
                  </span>
                  {c.platforms.has("instagram") && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                      {IG_LABEL}
                    </Badge>
                  )}
                  {c.platforms.has("tiktok") && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                      {TIKTOK_LABEL}
                    </Badge>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  <span className="text-foreground font-medium">{c.count}</span>{" "}
                  {c.count === 1
                    ? t("organic", "collabSingular")
                    : t("organic", "collabPlural")}
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gold/70"
                  style={{ width: `${(c.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {collaborators.length > top.length && (
          <p className="text-[10px] text-muted-foreground italic">
            +{collaborators.length - top.length}{" "}
            {t("organic", "moreCollaborators")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
