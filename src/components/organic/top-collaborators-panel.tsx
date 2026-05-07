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
 *
 * Pattern: top 5 visibili di default, "Mostra tutti" toggle per
 * espandere alla lista completa. Ogni riga ha icona link al
 * profilo IG/TikTok per ispezione veloce.
 */

import { useState } from "react";
import { Users, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import type { CollabFrequency } from "@/lib/organic/collaborations";

const TIKTOK_LABEL = "TikTok";
const IG_LABEL = "Instagram";
const INITIAL_VISIBLE = 5;

/** URL del profilo per piattaforma. Preferenza: IG se presente,
 *  altrimenti TikTok. Per account comuni alle due usiamo IG come
 *  default (piu' diffuso per browse profile). */
function profileUrlFor(handle: string, platforms: Set<string>): string {
  if (platforms.has("instagram")) {
    return `https://www.instagram.com/${handle}/`;
  }
  if (platforms.has("tiktok")) {
    return `https://www.tiktok.com/@${handle}`;
  }
  return `https://www.instagram.com/${handle}/`;
}

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
  const [expanded, setExpanded] = useState(false);
  if (collaborators.length === 0 || totalPosts === 0) {
    return null;
  }
  const collabRate =
    totalPosts > 0 ? Math.round((totalCollabPosts / totalPosts) * 100) : 0;
  const visible = expanded
    ? collaborators
    : collaborators.slice(0, INITIAL_VISIBLE);
  const maxCount = collaborators[0]?.count ?? 1;
  const hidden = collaborators.length - visible.length;
  // Nascondi le badge "Instagram"/"TikTok" quando tutti i
  // collaboratori sono su una sola piattaforma — il filtro globale
  // del tab gia' lo dichiara, ripetere la label su ogni riga e'
  // rumore. Mostra le badge SOLO in vista multi-piattaforma (es.
  // un eventuale futuro tab "All channels").
  const platformsInDataset = new Set<string>();
  for (const c of collaborators) {
    for (const p of c.platforms) platformsInDataset.add(p);
  }
  const showPlatformBadges = platformsInDataset.size > 1;

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
          {visible.map((c) => (
            <div key={c.handle} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <a
                    href={profileUrlFor(c.handle, c.platforms)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground truncate hover:text-gold inline-flex items-center gap-1 group"
                  >
                    @{c.handle}
                    <ExternalLink className="size-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                  </a>
                  {showPlatformBadges && c.platforms.has("instagram") && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                      {IG_LABEL}
                    </Badge>
                  )}
                  {showPlatformBadges && c.platforms.has("tiktok") && (
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
        {(hidden > 0 || expanded) && collaborators.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            className="flex items-center gap-1 text-[11px] text-gold hover:text-gold/80 transition-colors font-medium"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" />
                {t("organic", "showLess")}
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                {t("organic", "showAllCollaborators")} ({hidden})
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
