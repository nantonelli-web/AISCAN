import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * GET /api/debug/last-google-scan?brand=<nome>
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
        // Sempre presente (anche array vuoto) cosi' la UI mostra la
        // sezione con "0 tentativi" invece di nasconderla del tutto.
        webhookDispatches: Array<{
          status: string | null;
          requestUrl: string | null;
          responseStatus: number | null;
          attempts: number | null;
          finishedAt: string | null;
        }>;
        webhookDispatchesError?: string;
      } = {
        rawItemCount: null,
        sampleAdvertiserIds: null,
        runStatus: null,
        webhookDispatches: [],
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

          // Carica i webhook dispatches per capire se Apify ha
          // provato a chiamarci e con che esito (status HTTP della
          // nostra risposta). Senza questo non si capisce se i webhook
          // non arrivano per problema lato Apify (non chiamati) o
          // lato AISCAN (chiamati ma rifiutati con 401/500).
          //
          // L'endpoint Apify e' `/v2/webhook-dispatches` (lista
          // user-level): nessun nested per runId. Carichiamo gli
          // ultimi 200 dispatches e filtriamo per actorRunId. Per
          // ad-hoc webhooks il campo che porta il runId nei dispatches
          // varia: alcuni cluster Apify lo mettono su
          // `actorRun.id`/`run.id`/`runId`, altri lo includono solo
          // come parte del `payload`. Provo tutti i path.
          try {
            const dispRes = await fetch(
              `https://api.apify.com/v2/webhook-dispatches?limit=200&desc=true`,
              { headers: { authorization: `Bearer ${creds.token}` } },
            );
            if (dispRes.ok) {
              const dispBody = (await dispRes.json()) as {
                data?: {
                  items?: Array<{
                    status?: string;
                    requestUrl?: string;
                    responseStatus?: number;
                    attempts?: number;
                    finishedAt?: string;
                    actorRunId?: string;
                    runId?: string;
                    actorRun?: { id?: string };
                    run?: { id?: string };
                    payload?: unknown;
                  }>;
                };
              };
              const items = dispBody.data?.items ?? [];
              const matchRunId = (
                d: (typeof items)[number],
              ): boolean => {
                if (d.actorRunId === job.apify_run_id) return true;
                if (d.runId === job.apify_run_id) return true;
                if (d.actorRun?.id === job.apify_run_id) return true;
                if (d.run?.id === job.apify_run_id) return true;
                // Fallback: alcuni cluster Apify non espongono il
                // runId come campo strutturato, quindi cerchiamo il
                // runId come substring nel payload JSON-stringified.
                if (d.payload) {
                  try {
                    const s = JSON.stringify(d.payload);
                    if (s.includes(job.apify_run_id ?? "")) return true;
                  } catch {
                    /* payload non serializzabile, ignoriamo */
                  }
                }
                return false;
              };
              apifyDataset.webhookDispatches = items
                .filter(matchRunId)
                .map((d) => ({
                  status: d.status ?? null,
                  requestUrl: d.requestUrl ?? null,
                  responseStatus: d.responseStatus ?? null,
                  attempts: d.attempts ?? null,
                  finishedAt: d.finishedAt ?? null,
                }));
            } else {
              apifyDataset.webhookDispatchesError = `HTTP ${dispRes.status}`;
            }
          } catch (e) {
            apifyDataset.webhookDispatchesError =
              e instanceof Error ? e.message : "fetch error";
          }
        } catch (e) {
          apifyDataset.error = e instanceof Error ? e.message : "fetch error";
        }
      }

      const filterMismatch =
        apifyDataset.rawItemCount != null &&
        apifyDataset.rawItemCount > 0 &&
        (job?.records_count ?? 0) === 0 &&
        job?.status !== "running";

      const jobRunning = job?.status === "running";
      const apifyDone =
        apifyDataset.runStatus != null &&
        apifyDataset.runStatus !== "RUNNING" &&
        apifyDataset.runStatus !== "READY";
      const dispatchCount = apifyDataset.webhookDispatches.length;

      let diagnosis: string;
      if (!job) {
        diagnosis = "Nessun job Google trovato per questo brand";
      } else if (filterMismatch) {
        diagnosis = `BUG FILTRO: Apify ha trovato ${apifyDataset.rawItemCount} items ma 0 finalizzati in DB. Probabilmente il filtro advertiser-id li ha scartati (advertiserId atteso non matcha quelli reali tornati). Confronta brand.advertiserId con apify.sampleAdvertiserIds.`;
      } else if (jobRunning && apifyDone && dispatchCount === 0) {
        diagnosis = `WEBHOOK NON RICEVUTO: Apify ha finito il run (status=${apifyDataset.runStatus}) ma non ha registrato NESSUN tentativo di webhook verso AISCAN. Probabile causa: lo scan e' stato lanciato senza webhook config (env vars assenti su quella function). Usa "Recupera dati" per finalizzare manualmente.`;
      } else if (jobRunning && apifyDone && dispatchCount > 0) {
        diagnosis = `WEBHOOK ARRIVATI MA JOB FERMO: Apify ha provato ${dispatchCount} chiamate ma il job DB e' ancora 'running'. Controlla lo status HTTP dei dispatches qui sotto: 401 = secret mismatch, 5xx = bug nel webhook handler.`;
      } else if (jobRunning) {
        diagnosis = `Scan ancora in esecuzione su Apify (status=${apifyDataset.runStatus ?? "n/d"}). Niente di anomalo, attendi il termine.`;
      } else if ((apifyDataset.rawItemCount ?? 0) === 0) {
        diagnosis =
          "Apify ha trovato 0 items: il brand non ha ads pubblici visibili nella Transparency Center con la config attuale (verifica advertiserId/domain/country)";
      } else {
        diagnosis = "OK";
      }

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
        diagnosis,
      };
    }),
  );

  return NextResponse.json({
    query: brandQuery,
    matches: results,
  });
}
