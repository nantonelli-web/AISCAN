import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * GET /api/_debug/last-google-scan?brand=<nome>
 *
 * Diagnostico per capire perche' un brand risulta con 0 ads dopo
 * uno scan Google. Cerca i brand del workspace per nome (LIKE),
 * carica l'ultimo job Google per ognuno, interroga Apify per il
 * raw count del dataset, e ritorna tutto cosi' si vede:
 *   - status DB del job (succeeded/partial/failed/running)
 *   - records_count (quanti finalizzati in DB)
 *   - rawItemCount (quanti raw items su Apify)
 *   - apify run status
 *   - scan_options usati (advertiserId / domain / country)
 *   - error message se presente
 *
 * Se raw > records → bug di filtro client-side. Se raw == 0 →
 * Apify non ha trovato nulla (config errata o brand davvero senza
 * ads pubblici).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const brandQuery = url.searchParams.get("brand");
  if (!brandQuery) {
    return NextResponse.json(
      { error: "Missing ?brand=<nome>" },
      { status: 400 },
    );
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

  const admin = createAdminClient();
  const { data: brands } = await admin
    .from("mait_competitors")
    .select("id, page_name, google_advertiser_id, google_domain, country")
    .eq("workspace_id", workspaceId)
    .ilike("page_name", `%${brandQuery}%`)
    .limit(10);

  type Comp = {
    id: string;
    page_name: string | null;
    google_advertiser_id: string | null;
    google_domain: string | null;
    country: string | null;
  };
  const compList = (brands as Comp[] | null) ?? [];
  if (compList.length === 0) {
    return NextResponse.json({ matches: [], message: "Nessun brand trovato" });
  }

  const creds = await getApifyCredentials(workspaceId).catch(() => null);

  const results = await Promise.all(
    compList.map(async (c) => {
      const { data: jobs } = await admin
        .from("mait_scrape_jobs")
        .select(
          "id, status, source, started_at, completed_at, records_count, cost_cu, error, apify_run_id, dataset_id, scan_options, batch_id, webhook_received_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("competitor_id", c.id)
        .eq("source", "google")
        .order("started_at", { ascending: false })
        .limit(1);
      const job = jobs?.[0];

      const apifyDataset: {
        rawItemCount: number | null;
        sampleAdvertiserIds: string[] | null;
        runStatus: string | null;
        error?: string;
      } = {
        rawItemCount: null,
        sampleAdvertiserIds: null,
        runStatus: null,
      };

      if (job?.apify_run_id && creds?.token) {
        try {
          const runRes = await fetch(
            `https://api.apify.com/v2/actor-runs/${job.apify_run_id}`,
            { headers: { authorization: `Bearer ${creds.token}` } },
          );
          if (runRes.ok) {
            const body = (await runRes.json()) as {
              data?: { status?: string; defaultDatasetId?: string };
            };
            apifyDataset.runStatus = body.data?.status ?? null;
            const datasetId =
              body.data?.defaultDatasetId ?? job.dataset_id ?? null;
            if (datasetId) {
              const dsRes = await fetch(
                `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&limit=1000`,
                { headers: { authorization: `Bearer ${creds.token}` } },
              );
              if (dsRes.ok) {
                const items = (await dsRes.json()) as unknown[];
                apifyDataset.rawItemCount = Array.isArray(items)
                  ? items.length
                  : 0;
                // Sample dei primi 5 advertiserId distinti — utile per
                // capire se il filtro advertiser-id sta scartando tutto
                const advs = new Set<string>();
                for (const it of items.slice(0, 200)) {
                  const adv = (it as Record<string, unknown>)?.advertiserId;
                  if (typeof adv === "string" && adv) advs.add(adv);
                  if (advs.size >= 5) break;
                }
                apifyDataset.sampleAdvertiserIds = Array.from(advs);
              } else {
                apifyDataset.error = `Apify dataset fetch ${dsRes.status}`;
              }
            }
          } else {
            apifyDataset.error = `Apify run fetch ${runRes.status}`;
          }
        } catch (e) {
          apifyDataset.error = e instanceof Error ? e.message : "fetch error";
        }
      }

      const filterMismatch =
        apifyDataset.rawItemCount != null &&
        apifyDataset.rawItemCount > 0 &&
        (job?.records_count ?? 0) === 0;

      return {
        brand: {
          id: c.id,
          name: c.page_name,
          advertiserId: c.google_advertiser_id,
          domain: c.google_domain,
          country: c.country,
        },
        job: job
          ? {
              id: job.id,
              status: job.status,
              started_at: job.started_at,
              completed_at: job.completed_at,
              records_count: job.records_count,
              cost_cu: job.cost_cu,
              error: job.error,
              apify_run_id: job.apify_run_id,
              webhook_received_at: job.webhook_received_at,
              batch_id: job.batch_id,
              scan_options: job.scan_options,
            }
          : null,
        apify: apifyDataset,
        diagnosis:
          !job
            ? "Nessun job Google trovato per questo brand"
            : filterMismatch
              ? `BUG FILTRO: Apify ha trovato ${apifyDataset.rawItemCount} items ma 0 finalizzati in DB. Probabilmente il filtro advertiser-id li ha scartati (advertiserId atteso non matcha quelli reali tornati). Confronta brand.advertiserId con apify.sampleAdvertiserIds.`
              : (apifyDataset.rawItemCount ?? 0) === 0
                ? "Apify ha trovato 0 items: il brand non ha ads pubblici visibili nella Transparency Center con la config attuale (verifica advertiserId/domain/country)"
                : "OK",
      };
    }),
  );

  return NextResponse.json({
    query: brandQuery,
    matches: results,
  });
}
