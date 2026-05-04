"use client";

import Link from "next/link";
import {
  Search,
  Globe,
  Megaphone,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { formatDate } from "@/lib/utils";

interface SerpMatch {
  result_type: string;
  position: number | null;
  url: string | null;
  title: string | null;
}

interface BrandSerpQueryRank {
  query_id: string;
  query: string;
  country: string;
  language: string;
  device: string;
  label: string | null;
  last_scraped_at: string | null;
  best_organic_position: number | null;
  best_paid_position: number | null;
  organic_match_count: number;
  paid_match_count: number;
  top_match: SerpMatch | null;
}

/**
 * Per-query rank card on the brand-detail SERP tab. The card answers
 * one question only: "where does this brand rank for this query?".
 *
 * Visual hierarchy:
 *   - left:  query text + query metadata badges
 *   - right: position chips (organic / paid) + last-scraped chip
 *   - below: top-match excerpt (title + url) so the user can verify
 *            which page Google actually picked for the brand
 */
export function BrandSerpRankCard({ rank }: { rank: BrandSerpQueryRank }) {
  const { t } = useT();
  const hasOrganic = rank.best_organic_position != null;
  const hasPaid = rank.best_paid_position != null;
  const noMatch = !hasOrganic && !hasPaid;

  return (
    <Card
      className={`channel-rail ${noMatch ? "opacity-70" : "hover:border-gold/40 transition-colors"}`}
      data-channel="serp"
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-4">
          <Search className="size-5 text-gold shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/serp/${rank.query_id}`}
              className="text-base font-medium hover:text-gold transition-colors break-words"
            >
              {rank.query}
            </Link>
            {rank.label && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {rank.label}
              </p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <Badge variant="outline" className="text-[10px]">
                <Globe className="size-3 mr-1" />
                {rank.country}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {rank.language}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {rank.device}
              </Badge>
            </div>
          </div>
          <Link
            href={`/serp/${rank.query_id}`}
            className="text-muted-foreground hover:text-gold shrink-0"
            title={t("brandSerp", "openSerp")}
          >
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        {/* Position chips — gold for organic (most valuable signal),
            outline for paid, dimmed em-dash when not present. */}
        <div className="flex items-center gap-2 flex-wrap pl-9">
          <span
            className={
              hasOrganic
                ? "inline-flex items-center gap-1.5 rounded-md bg-gold/15 text-gold border border-gold/30 px-2.5 py-1 text-xs font-medium"
                : "inline-flex items-center gap-1.5 rounded-md bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs"
            }
          >
            <Search className="size-3" />
            {hasOrganic
              ? `${t("brandSerp", "organic")} #${rank.best_organic_position}`
              : `${t("brandSerp", "organic")} —`}
            {rank.organic_match_count > 1 && (
              <span className="text-[10px] opacity-70">
                ({rank.organic_match_count})
              </span>
            )}
          </span>
          <span
            className={
              hasPaid
                ? "inline-flex items-center gap-1.5 rounded-md bg-foreground/5 text-foreground border border-border px-2.5 py-1 text-xs font-medium"
                : "inline-flex items-center gap-1.5 rounded-md bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs"
            }
          >
            <Megaphone className="size-3" />
            {hasPaid
              ? `${t("brandSerp", "paid")} #${rank.best_paid_position}`
              : `${t("brandSerp", "paid")} —`}
            {rank.paid_match_count > 1 && (
              <span className="text-[10px] opacity-70">
                ({rank.paid_match_count})
              </span>
            )}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {rank.last_scraped_at
              ? `${t("brandSerp", "lastScraped")} ${formatDate(rank.last_scraped_at)}`
              : t("brandSerp", "neverScraped")}
          </span>
        </div>

        {/* Top match excerpt — only when we have a position. Shows
            the user which exact page Google picked for the brand. */}
        {rank.top_match && (rank.top_match.title || rank.top_match.url) && (
          <div className="pl-9 pt-2 border-t border-border space-y-0.5">
            <p className="text-xs text-foreground/80 line-clamp-1">
              {rank.top_match.title ?? "—"}
            </p>
            {rank.top_match.url && (
              <a
                href={rank.top_match.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-muted-foreground hover:text-gold flex items-center gap-1 truncate"
              >
                {rank.top_match.url.replace(/^https?:\/\/(www\.)?/, "")}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
