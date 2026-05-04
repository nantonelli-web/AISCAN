"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { SnapchatProfileCard } from "@/components/organic/snapchat-profile-card";
import { YoutubeVideoCard } from "@/components/organic/youtube-video-card";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
} from "@/types";

/**
 * Library items renderer + Load More controller. Holds the current
 * list in state seeded with whatever the server pre-rendered, and
 * appends extra rows fetched from /api/library/items on demand.
 *
 * The 5 channel branches (ads / IG / TikTok / Snapchat / YouTube)
 * are kept here so the page-level component stays a flat
 * "fetch + render" surface. The per-channel "kind" prop drives
 * which card component renders each row; payload shapes are
 * disjoint enough that the discriminated union plays well with TS.
 */

type LibraryKind = "ads" | "instagram" | "tiktok" | "snapchat" | "youtube";

type ItemsByKind =
  | { kind: "ads"; items: MaitAdExternal[] }
  | { kind: "instagram"; items: MaitOrganicPost[] }
  | { kind: "tiktok"; items: MaitTikTokPost[] }
  | { kind: "snapchat"; items: MaitSnapchatProfile[] }
  | { kind: "youtube"; items: MaitYoutubeVideo[] };

interface SearchParamsShape {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
  client?: string;
}

export function LibraryItemsView({
  initial,
  initialHasMore,
  pageSize,
  searchParams,
  brandNameById,
  showBrandLabel,
  showSourceSections,
}: {
  initial: ItemsByKind;
  initialHasMore: boolean;
  pageSize: number;
  searchParams: SearchParamsShape;
  brandNameById: Record<string, string>;
  showBrandLabel: boolean;
  showSourceSections: boolean;
}) {
  const { t } = useT();
  // Type-safe per-kind state — we initialise the bucket matching
  // the incoming `initial.kind` and leave others empty. Switching
  // kinds requires a full page navigation anyway (the URL `channel`
  // param flips), so we don't need to reset state on change.
  const [items, setItems] = useState<ItemsByKind>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      // Only forward keys the API understands; skip undefined.
      const passthrough: Array<keyof SearchParamsShape> = [
        "q",
        "platform",
        "cta",
        "status",
        "format",
        "channel",
        "brand",
        "client",
      ];
      for (const k of passthrough) {
        const v = searchParams[k];
        if (v) params.set(k, v);
      }
      params.set("offset", String(items.items.length));
      params.set("limit", String(pageSize));
      const res = await fetch(`/api/library/items?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Errore");
        return;
      }
      const data = (await res.json()) as { items: unknown[]; hasMore: boolean };
      // Append by re-narrowing the kind. Object spread over the
      // discriminated union preserves the kind literal so TS stays
      // happy across the 5 branches.
      setItems((prev) => {
        switch (prev.kind) {
          case "ads":
            return { kind: "ads", items: [...prev.items, ...(data.items as MaitAdExternal[])] };
          case "instagram":
            return { kind: "instagram", items: [...prev.items, ...(data.items as MaitOrganicPost[])] };
          case "tiktok":
            return { kind: "tiktok", items: [...prev.items, ...(data.items as MaitTikTokPost[])] };
          case "snapchat":
            return { kind: "snapchat", items: [...prev.items, ...(data.items as MaitSnapchatProfile[])] };
          case "youtube":
            return { kind: "youtube", items: [...prev.items, ...(data.items as MaitYoutubeVideo[])] };
        }
      });
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Result count — uses the live state length so it grows
          as the user clicks Load More. */}
      <p className="text-base text-foreground flex items-baseline gap-2">
        <span className="font-semibold tabular-nums">{items.items.length}</span>
        <span className="text-muted-foreground">{t("library", "resultsLabel")}</span>
      </p>

      <RenderGrid
        items={items}
        brandNameById={brandNameById}
        showBrandLabel={showBrandLabel}
        showSourceSections={showSourceSections && items.kind === "ads"}
      />

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={loadMore}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("library", "loadingMore")}
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {t("library", "loadMore")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function RenderGrid({
  items,
  brandNameById,
  showBrandLabel,
  showSourceSections,
}: {
  items: ItemsByKind;
  brandNameById: Record<string, string>;
  showBrandLabel: boolean;
  showSourceSections: boolean;
}) {
  if (items.kind === "instagram") {
    return (
      <Grid>
        {items.items.map((p) => (
          <BrandFramedItem
            key={p.id}
            brandName={
              showBrandLabel
                ? brandNameById[p.competitor_id ?? ""] ?? null
                : null
            }
          >
            <OrganicPostCard post={p} />
          </BrandFramedItem>
        ))}
      </Grid>
    );
  }
  if (items.kind === "tiktok") {
    return (
      <Grid>
        {items.items.map((p) => (
          <BrandFramedItem
            key={p.id}
            brandName={
              showBrandLabel
                ? brandNameById[p.competitor_id ?? ""] ?? null
                : null
            }
          >
            <TikTokPostCard post={p} />
          </BrandFramedItem>
        ))}
      </Grid>
    );
  }
  if (items.kind === "snapchat") {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.items.map((p) => (
          <BrandFramedItem
            key={p.id}
            brandName={
              showBrandLabel
                ? brandNameById[p.competitor_id ?? ""] ?? null
                : null
            }
          >
            <SnapchatProfileCard profile={p} />
          </BrandFramedItem>
        ))}
      </div>
    );
  }
  if (items.kind === "youtube") {
    return (
      <Grid>
        {items.items.map((v) => (
          <BrandFramedItem
            key={v.id}
            brandName={
              showBrandLabel
                ? brandNameById[v.competitor_id ?? ""] ?? null
                : null
            }
          >
            <YoutubeVideoCard video={v} />
          </BrandFramedItem>
        ))}
      </Grid>
    );
  }
  // Ads — split into Meta / Google sections only when no channel
  // filter is active and there's at least one of each.
  if (showSourceSections) {
    const metaAds = items.items.filter((a) => a.source === "meta");
    const googleAds = items.items.filter((a) => a.source === "google");
    return (
      <div className="space-y-8">
        {metaAds.length > 0 && (
          <AdSection
            title="Meta Ads"
            count={metaAds.length}
            ads={metaAds}
            brandNameById={showBrandLabel ? brandNameById : null}
          />
        )}
        {googleAds.length > 0 && (
          <AdSection
            title="Google Ads"
            count={googleAds.length}
            ads={googleAds}
            brandNameById={showBrandLabel ? brandNameById : null}
          />
        )}
      </div>
    );
  }
  return (
    <Grid>
      {items.items.map((a) => (
        <BrandFramedItem
          key={a.id}
          brandName={
            showBrandLabel
              ? brandNameById[a.competitor_id ?? ""] ?? null
              : null
          }
        >
          <AdCard ad={a} />
        </BrandFramedItem>
      ))}
    </Grid>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

function AdSection({
  title,
  count,
  ads,
  brandNameById,
}: {
  title: string;
  count: number;
  ads: MaitAdExternal[];
  brandNameById: Record<string, string> | null;
}) {
  return (
    <section className="space-y-4">
      <header className="rounded-md bg-muted/20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {count} ads
          </span>
        </div>
      </header>
      <Grid>
        {ads.map((a) => (
          <BrandFramedItem
            key={a.id}
            brandName={
              brandNameById ? brandNameById[a.competitor_id ?? ""] ?? null : null
            }
          >
            <AdCard ad={a} />
          </BrandFramedItem>
        ))}
      </Grid>
    </section>
  );
}

function BrandFramedItem({
  brandName,
  children,
}: {
  brandName: string | null;
  children: React.ReactNode;
}) {
  if (!brandName) {
    return <>{children}</>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-gold/80 px-1 truncate">
        {brandName}
      </p>
      {children}
    </div>
  );
}

// Re-export the kind type so the page-level component can pass
// the correct discriminant when seeding initial state.
export type LibraryItemsKind = LibraryKind;
