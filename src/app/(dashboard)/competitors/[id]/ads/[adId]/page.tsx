import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Calendar, Clock, Globe, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { MaitAdExternal } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string; adId: string }>;
}) {
  const { id: competitorId, adId } = await params;
  await getSessionUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("mait_ads_external")
    .select("*")
    .eq("id", adId)
    .single();

  if (!data) notFound();
  const ad = data as MaitAdExternal;

  const raw = ad.raw_data as Record<string, unknown> | null;
  const snapshot = raw?.snapshot as Record<string, unknown> | null;
  const cards = (snapshot?.cards ?? []) as Array<{
    title?: string;
    body?: string;
    originalImageUrl?: string;
    resizedImageUrl?: string;
    linkUrl?: string;
    ctaText?: string;
  }>;
  const aiTags = raw?.ai_tags as Record<string, string> | null;
  const pageName = (raw?.pageName as string) ?? (snapshot?.pageName as string) ?? null;
  const adLibraryUrl =
    (raw?.adLibraryURL as string) ??
    `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`;

  // Calculate campaign duration
  let durationDays: number | null = null;
  if (ad.start_date) {
    const start = new Date(ad.start_date).getTime();
    const end = ad.end_date ? new Date(ad.end_date).getTime() : Date.now();
    durationDays = Math.max(1, Math.round((end - start) / 86_400_000));
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href={`/competitors/${competitorId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Torna al competitor
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {pageName && (
            <p className="text-xs uppercase tracking-[0.15em] text-gold mb-1">
              {pageName}
            </p>
          )}
          <h1 className="text-2xl font-serif tracking-tight">
            {ad.headline ?? `Ad ${ad.ad_archive_id}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ID: {ad.ad_archive_id}
          </p>
        </div>
        <div className="flex gap-2">
          {ad.status === "ACTIVE" && <Badge variant="gold">ACTIVE</Badge>}
          <a
            href={adLibraryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-sm hover:border-gold/40 hover:text-gold transition-colors"
          >
            Meta Ad Library <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Main creative */}
        <div className="lg:col-span-3 space-y-4">
          {/* Primary image */}
          {ad.image_url && !ad.image_url.includes("/render_ad/") && (
            <Card>
              <CardContent className="p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.image_url}
                  alt={ad.headline ?? "ad creative"}
                  className="w-full rounded-xl"
                />
              </CardContent>
            </Card>
          )}

          {/* All card variants */}
          {cards.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Varianti creative ({cards.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  {cards.map((card, i) => {
                    const imgUrl =
                      card.originalImageUrl ?? card.resizedImageUrl;
                    return (
                      <div key={i} className="space-y-2">
                        {imgUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgUrl}
                            alt={`Variante ${i + 1}`}
                            className="w-full rounded-lg border border-border"
                          />
                        )}
                        {card.title && (
                          <p className="text-xs font-medium">{card.title}</p>
                        )}
                        {card.body && (
                          <p className="text-[11px] text-muted-foreground">
                            {card.body}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full ad text */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Testo completo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ad.headline && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Headline</p>
                  <p className="font-medium">{ad.headline}</p>
                </div>
              )}
              {ad.ad_text && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Copy</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {ad.ad_text}
                  </p>
                </div>
              )}
              {ad.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Descrizione
                  </p>
                  <p className="text-sm">{ad.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dettagli</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailRow
                icon={<Calendar className="size-4" />}
                label="Data inizio"
                value={formatDate(ad.start_date)}
              />
              <DetailRow
                icon={<Calendar className="size-4" />}
                label="Data fine"
                value={ad.end_date ? formatDate(ad.end_date) : "Ancora attiva"}
              />
              {durationDays && (
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label="Durata"
                  value={`${durationDays} giorni`}
                />
              )}
              {ad.cta && (
                <DetailRow
                  icon={<ExternalLink className="size-4" />}
                  label="CTA"
                  value={ad.cta}
                />
              )}
              {ad.landing_url && (
                <div className="flex items-start gap-3">
                  <Globe className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Landing page</p>
                    <a
                      href={ad.landing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-gold hover:underline break-all"
                    >
                      {ad.landing_url}
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {ad.platforms && ad.platforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Piattaforme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {ad.platforms.map((p) => (
                    <Badge key={p} variant="muted">
                      {p}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiTags && Object.keys(aiTags).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="size-4" /> AI Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(aiTags).map(([key, value]) => {
                  if (!value || typeof value !== "string") return null;
                  const labels: Record<string, string> = {
                    sector: "Settore",
                    creative_format: "Formato",
                    tone: "Tono",
                    objective: "Obiettivo",
                    seasonality: "Stagionalità",
                    language: "Lingua",
                  };
                  return (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {labels[key] ?? key}
                      </span>
                      <Badge variant="gold">{value}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
