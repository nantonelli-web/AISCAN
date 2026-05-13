import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/persona-attribution
 *
 * Diagnostico: scansiona le ads attribute al brand "Marina Rinaldi"
 * cercando signal che indichino "questa e' un'ad di Persona" (sub-
 * brand di Marina Rinaldi senza dominio proprio). Per ognuna calcola
 * un score di confidenza che e' Persona + ritorna distribuzione e
 * sample qualitativi.
 *
 * Per i signal usiamo principalmente URL e UTM (oggettivi):
 *   - landing_url contiene "persona" come path/host/query
 *   - UTM parameters (utm_campaign / utm_content / utm_source)
 *     contengono "persona"
 *   - hostname dedicato persona.marinarinaldi.com
 *
 * Lasciamo headline/ad_text COMMENTATO perche' "persona" e' parola
 * italiana comune (es. "una persona dinamica") → troppi falsi
 * positivi su un brand fashion.
 *
 * Output:
 *   - total_ads_in_marina
 *   - score_distribution (histogram per bucket)
 *   - top_samples: 50 ads con score >= 50 (probabili Persona)
 *   - mid_samples: 10 ads con 20 <= score < 50 (ambigue, da rivedere)
 *   - signal_counts: quante ads matchano ogni signal
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AdRow {
  id: string;
  ad_archive_id: string;
  competitor_id: string;
  headline: string | null;
  ad_text: string | null;
  landing_url: string | null;
  raw_data: Record<string, unknown> | null;
  status: string | null;
}

interface SignalHits {
  landing_url_path: boolean;
  landing_url_host: boolean;
  landing_url_query: boolean;
  utm_persona: boolean;
  utm_brand_persona: boolean;
}

interface ScoredAd {
  ad: AdRow;
  score: number;
  signals: SignalHits;
  matched: { landing_url?: string; utm?: string };
}

function emptySignals(): SignalHits {
  return {
    landing_url_path: false,
    landing_url_host: false,
    landing_url_query: false,
    utm_persona: false,
    utm_brand_persona: false,
  };
}

function score(ad: AdRow): ScoredAd {
  const signals = emptySignals();
  const matched: { landing_url?: string; utm?: string } = {};
  let s = 0;

  const url = ad.landing_url;
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const query = parsed.search.toLowerCase();

      // Host dedicato (es. persona.marinarinaldi.com, persona-store.com)
      if (host.startsWith("persona.") || host.includes(".persona.")) {
        signals.landing_url_host = true;
        s += 90;
        matched.landing_url = url;
      }
      // Path segment /persona/ o /persona?... o /persona-...
      if (/\/persona([\/?\-]|$)/.test(path)) {
        signals.landing_url_path = true;
        s += 70;
        matched.landing_url = url;
      }
      // Query string ?brand=persona, ?cluster=persona, ?subbrand=persona
      const params = parsed.searchParams;
      const queryFlags = [
        "brand",
        "subbrand",
        "sub_brand",
        "cluster",
        "marca",
        "linea",
        "collection",
      ];
      for (const k of queryFlags) {
        const v = params.get(k);
        if (v && v.toLowerCase().includes("persona")) {
          signals.landing_url_query = true;
          s += 50;
          matched.landing_url = url;
          break;
        }
      }
      // UTM params
      const utmCampaign = params.get("utm_campaign");
      const utmContent = params.get("utm_content");
      const utmSource = params.get("utm_source");
      const utmMedium = params.get("utm_medium");
      const utmTerm = params.get("utm_term");
      const allUtms = [
        utmCampaign,
        utmContent,
        utmSource,
        utmMedium,
        utmTerm,
      ].filter((v): v is string => !!v);
      const utmContainsPersona = allUtms.find((v) =>
        /persona/i.test(v),
      );
      if (utmContainsPersona) {
        signals.utm_persona = true;
        // Score piu' alto se utm_campaign o utm_content contiene
        // persona come token isolato (non substring di "persone" o
        // "personalizzato")
        const isToken = /\bpersona\b/i.test(utmContainsPersona);
        s += isToken ? 60 : 30;
        matched.utm = utmContainsPersona;
      }
      // Bonus: utm_campaign che inizia con "persona" o ha "_persona_"
      const utmCampLower = (utmCampaign ?? "").toLowerCase();
      if (
        utmCampLower.startsWith("persona") ||
        utmCampLower.startsWith("pers_") ||
        utmCampLower.startsWith("pers-") ||
        utmCampLower.includes("_persona_") ||
        utmCampLower.includes("-persona-")
      ) {
        signals.utm_brand_persona = true;
        s += 30;
        if (utmCampaign) matched.utm = utmCampaign;
      }
      void query;
    } catch {
      // landing_url non parseable: ignoriamo
    }
  }

  return { ad, score: s, signals, matched };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const url = new URL(req.url);
  const marinaIdParam = url.searchParams.get("marina_brand_id");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "2000"),
    5000,
  );

  const admin = createAdminClient();
  let marinaId = marinaIdParam;
  if (!marinaId) {
    const { data } = await admin
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .ilike("page_name", "%marina%rinaldi%")
      .limit(1)
      .maybeSingle();
    marinaId = (data as { id: string } | null)?.id ?? null;
  }
  if (!marinaId) {
    return NextResponse.json(
      {
        error:
          "Marina Rinaldi brand_id non trovato. Passa ?marina_brand_id=<uuid>",
      },
      { status: 404 },
    );
  }

  const { data, error } = await admin
    .from("mait_ads_external")
    .select(
      "id, ad_archive_id, competitor_id, headline, ad_text, landing_url, raw_data, status",
    )
    .eq("workspace_id", workspaceId)
    .eq("competitor_id", marinaId)
    .eq("source", "google")
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ads = (data ?? []) as AdRow[];

  const scored = ads.map(score);

  // Distribuzione score per bucket
  const buckets: Record<string, number> = {
    "0 (no signal)": 0,
    "1-29 (weak)": 0,
    "30-49 (mid)": 0,
    "50-89 (strong)": 0,
    "90+ (very strong)": 0,
  };
  // Counts per signal
  const signalCounts = {
    landing_url_host: 0,
    landing_url_path: 0,
    landing_url_query: 0,
    utm_persona: 0,
    utm_brand_persona: 0,
  };
  for (const s of scored) {
    if (s.score === 0) buckets["0 (no signal)"]++;
    else if (s.score < 30) buckets["1-29 (weak)"]++;
    else if (s.score < 50) buckets["30-49 (mid)"]++;
    else if (s.score < 90) buckets["50-89 (strong)"]++;
    else buckets["90+ (very strong)"]++;
    for (const k of Object.keys(signalCounts) as Array<keyof SignalHits>) {
      if (s.signals[k]) signalCounts[k]++;
    }
  }

  const top = scored
    .filter((s) => s.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((s) => ({
      ad_archive_id: s.ad.ad_archive_id,
      score: s.score,
      status: s.ad.status,
      headline: s.ad.headline?.slice(0, 120) ?? null,
      landing_url: s.matched.landing_url ?? s.ad.landing_url ?? null,
      utm_match: s.matched.utm ?? null,
      signals: Object.entries(s.signals)
        .filter(([, v]) => v)
        .map(([k]) => k),
    }));
  const mid = scored
    .filter((s) => s.score >= 20 && s.score < 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => ({
      ad_archive_id: s.ad.ad_archive_id,
      score: s.score,
      headline: s.ad.headline?.slice(0, 120) ?? null,
      landing_url: s.ad.landing_url,
      utm_match: s.matched.utm ?? null,
    }));
  // 10 ads SENZA signal, per verifica falsi negativi
  const noneSamples = scored
    .filter((s) => s.score === 0)
    .slice(0, 10)
    .map((s) => ({
      ad_archive_id: s.ad.ad_archive_id,
      headline: s.ad.headline?.slice(0, 120) ?? null,
      landing_url: s.ad.landing_url,
    }));

  return NextResponse.json({
    marina_brand_id: marinaId,
    total_ads_under_marina: ads.length,
    score_distribution: buckets,
    signal_counts: signalCounts,
    samples: {
      probable_persona: top,
      ambiguous: mid,
      no_signal_random: noneSamples,
    },
  });
}
