"use client";

import { useState } from "react";
import { Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Brand {
  id: string;
  name: string | null;
  advertiserId: string | null;
  domain: string | null;
  country: string | null;
}

interface Job {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  records_count: number | null;
  cost_cu: number | null;
  error: string | null;
  apify_run_id: string | null;
  webhook_received_at: string | null;
  batch_id: string | null;
  scan_options: Record<string, unknown> | null;
}

interface ApifyInfo {
  rawItemCount: number | null;
  sampleAdvertiserIds: string[] | null;
  runStatus: string | null;
  error?: string;
}

interface Match {
  brand: Brand;
  job: Job | null;
  apify: ApifyInfo;
  diagnosis: string;
}

export function DebugScanClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setMatches(null);
    let rawText = "";
    try {
      const res = await fetch(
        `/api/_debug/last-google-scan?brand=${encodeURIComponent(query.trim())}`,
        { cache: "no-store" },
      );
      // Prima leggo testo poi parso JSON manualmente cosi gli errori
      // di parse non vengono inghiottiti dal browser come messaggi
      // generici ("The string did not match the expected pattern").
      rawText = await res.text();
      let j: unknown;
      try {
        j = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(
          "[scan-debug] JSON parse failed. status=",
          res.status,
          "body=",
          rawText.slice(0, 500),
          parseErr,
        );
        setError(
          `Risposta server non-JSON (status ${res.status}). Primi 200 char: ${rawText.slice(0, 200)}`,
        );
        return;
      }
      const obj = j as {
        error?: string;
        matches?: Match[];
      };
      if (!res.ok) {
        setError(obj.error ?? `HTTP ${res.status}`);
        return;
      }
      setMatches((obj.matches ?? []) as Match[]);
    } catch (e) {
      console.error("[scan-debug] fetch error", e, "rawText:", rawText);
      setError(
        `${e instanceof Error ? e.message : String(e)}${rawText ? ` (body: ${rawText.slice(0, 200)})` : ""}`,
      );
    } finally {
      setLoading(false);
    }
  }

  function diagnosisTone(d: string): "ok" | "warn" | "error" {
    if (d.startsWith("BUG FILTRO")) return "error";
    if (d.startsWith("Apify ha trovato 0")) return "warn";
    if (d === "OK") return "ok";
    return "warn";
  }

  const toneClasses: Record<"ok" | "warn" | "error", string> = {
    ok: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    warn: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    error: "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-2 flex-wrap">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Nome del brand (anche parziale, es. 'Ulla')"
            className="flex-1 min-w-[200px]"
          />
          <Button onClick={search} disabled={loading || !query.trim()}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Cerca
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {matches && matches.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Nessun brand trovato col nome che hai cercato.
        </div>
      )}

      {matches?.map((m) => {
        const tone = diagnosisTone(m.diagnosis);
        return (
          <Card key={m.brand.id} className="overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-base font-semibold">{m.brand.name}</h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    advertiserId:{" "}
                    <code className="font-mono">
                      {m.brand.advertiserId ?? "—"}
                    </code>{" "}
                    · domain:{" "}
                    <code className="font-mono">
                      {m.brand.domain ?? "—"}
                    </code>{" "}
                    · country: {m.brand.country ?? "—"}
                  </p>
                </div>
                <div
                  className={`rounded-md border px-3 py-1.5 text-[12px] font-medium inline-flex items-center gap-1.5 ${toneClasses[tone]}`}
                >
                  {tone === "ok" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <AlertTriangle className="size-3.5" />
                  )}
                  {tone === "ok"
                    ? "OK"
                    : tone === "error"
                      ? "Bug di filtro"
                      : "Da verificare"}
                </div>
              </div>

              <div className="rounded-md bg-muted/30 p-3 text-[12.5px] leading-relaxed">
                {m.diagnosis}
              </div>

              {/* Tabella metriche */}
              <div className="grid sm:grid-cols-3 gap-3">
                <Metric label="DB records" value={m.job?.records_count ?? 0} />
                <Metric
                  label="Apify raw items"
                  value={m.apify.rawItemCount ?? "—"}
                  highlight={
                    m.apify.rawItemCount != null &&
                    m.apify.rawItemCount > (m.job?.records_count ?? 0)
                  }
                />
                <Metric label="Job status" value={m.job?.status ?? "—"} />
              </div>

              {/* Advertiser IDs di sample */}
              {m.apify.sampleAdvertiserIds &&
                m.apify.sampleAdvertiserIds.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                      AdvertiserId trovati nel dataset Apify (sample)
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {m.apify.sampleAdvertiserIds.map((adv) => {
                        const match = adv === m.brand.advertiserId;
                        return (
                          <code
                            key={adv}
                            className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                              match
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            {adv}
                            {match && " ✓"}
                          </code>
                        );
                      })}
                    </div>
                    {m.brand.advertiserId &&
                      !m.apify.sampleAdvertiserIds.includes(
                        m.brand.advertiserId,
                      ) && (
                        <p className="text-[11.5px] text-red-600 dark:text-red-400">
                          ⚠️{" "}
                          {`L'advertiserId sul brand ('${m.brand.advertiserId}') NON e' tra quelli trovati da Apify. Probabilmente non e' corretto: aggiornalo dalla pagina del brand o svuotalo per usare solo il domain.`}
                        </p>
                      )}
                  </div>
                )}

              {/* Errore job */}
              {m.job?.error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[12px]">
                  <p className="font-medium text-red-700 dark:text-red-400 mb-1">
                    Errore job
                  </p>
                  <code className="block text-[11.5px] font-mono whitespace-pre-wrap">
                    {m.job.error}
                  </code>
                </div>
              )}

              {/* Errore Apify fetch */}
              {m.apify.error && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px]">
                  <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    Errore lettura Apify
                  </p>
                  <code className="block text-[11.5px] font-mono">
                    {m.apify.error}
                  </code>
                </div>
              )}

              {/* Link rapidi */}
              <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground border-t border-border pt-3">
                <a
                  href={`/brands/${m.brand.id}`}
                  className="underline hover:text-foreground"
                >
                  Vai al brand
                </a>
                {m.brand.domain && (
                  <a
                    href={`https://adstransparency.google.com/?domain=${encodeURIComponent(m.brand.domain)}`}
                    target="_blank"
                    rel="noopener"
                    className="underline hover:text-foreground"
                  >
                    Vedi su Google Transparency
                  </a>
                )}
                {m.job?.apify_run_id && (
                  <a
                    href={`https://console.apify.com/actors/runs/${m.job.apify_run_id}`}
                    target="_blank"
                    rel="noopener"
                    className="underline hover:text-foreground"
                  >
                    Run Apify
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? "border-red-500/40 bg-red-500/5"
          : "border-border bg-background"
      }`}
    >
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-lg font-semibold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
