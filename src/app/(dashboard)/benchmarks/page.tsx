import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { MetaIcon } from "@/components/ui/meta-icon";
import Link from "next/link";
import { BenchmarkContent } from "./benchmark-content";

export const dynamic = "force-dynamic";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/60 rounded animate-pulse ${className}`} />;
}

function ContentSkeleton() {
  return (
    <div className="space-y-8">
      <SkeletonBar className="h-4 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <SkeletonBar className="h-3 w-16" />
              <SkeletonBar className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <SkeletonBar className="h-[300px] w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBar key={i} className="h-[260px]" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const channel = sp.channel === "google" ? "google" : "meta";
  const rawClient = typeof sp.client === "string" ? sp.client : null;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Load clients + competitors for the filter bar — lightweight, keeps
  // the shell snappy even when the heavy query below is slow.
  const [{ data: clientsData }, { data: competitorsData }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
    supabase
      .from("mait_competitors")
      .select("id, client_id")
      .eq("workspace_id", profile.workspace_id!),
  ]);
  const clients = (clientsData ?? []) as { id: string; name: string; color: string }[];
  const allCompetitors = (competitorsData ?? []) as { id: string; client_id: string | null }[];

  const activeClient: "unassigned" | string | null =
    rawClient === "unassigned"
      ? "unassigned"
      : rawClient && clients.some((c) => c.id === rawClient)
        ? rawClient
        : null;

  const competitorIdsFilter: string[] | undefined = activeClient === null
    ? undefined
    : allCompetitors
        .filter((c) =>
          activeClient === "unassigned"
            ? c.client_id === null
            : c.client_id === activeClient
        )
        .map((c) => c.id);

  const channels = [
    { key: "meta" as const, label: "Meta Ads", icon: <MetaIcon className="size-3.5" /> },
    { key: "google" as const, label: "Google Ads", icon: <GoogleIcon className="size-3.5" /> },
  ];

  function hrefFor(ch: string | null, cl: string | null): string {
    const params = new URLSearchParams();
    if (ch) params.set("channel", ch);
    if (cl) params.set("client", cl);
    const qs = params.toString();
    return qs ? `/benchmarks?${qs}` : "/benchmarks";
  }

  const hasUnassigned = allCompetitors.some((c) => c.client_id === null);

  // Key drives the Suspense boundary: on filter change the boundary remounts
  // and shows the fallback immediately, so the page reacts to clicks even
  // while the server is still computing.
  const suspenseKey = `${channel}|${activeClient ?? "all"}`;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground">{t("benchmarks", "subtitle")}</p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      <div className="flex items-center gap-2 print:hidden">
        {channels.map((ch) => (
          <Link
            key={ch.key}
            href={hrefFor(ch.key, activeClient)}
            className={
              channel === ch.key
                ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
                : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            }
          >
            {ch.icon}
            {ch.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mr-1">
          {t("benchmarks", "filterByProject")}
        </span>
        <Link
          href={hrefFor(channel, null)}
          className={
            activeClient === null
              ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          }
        >
          {t("benchmarks", "allProjects")}
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={hrefFor(channel, c.id)}
            className={
              activeClient === c.id
                ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
                : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            }
          >
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
            {c.name}
          </Link>
        ))}
        {hasUnassigned && (
          <Link
            href={hrefFor(channel, "unassigned")}
            className={
              activeClient === "unassigned"
                ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
                : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            }
          >
            {t("clients", "unassigned")}
          </Link>
        )}
      </div>

      <Suspense key={suspenseKey} fallback={<ContentSkeleton />}>
        <BenchmarkContent
          workspaceId={profile.workspace_id!}
          channel={channel}
          competitorIdsFilter={competitorIdsFilter}
        />
      </Suspense>

      <div className="flex justify-center pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}
