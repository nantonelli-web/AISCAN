"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OpenRouterUsage {
  usage: number;
  limit: number | null;
  is_free_tier: boolean;
  rate_limit: { requests: number; interval: string } | null;
  label: string | null;
  error?: string;
}

interface ApifyServiceLine {
  service: string;
  quantity: number;
  amountUsd: number;
}

interface ApifyUsage {
  planId: string | null;
  planBasePriceUsd: number | null;
  monthlyCreditsUsd: number | null;
  monthlyUsageUsd: number;
  breakdown: ApifyServiceLine[];
  cycleStart: string | null;
  cycleEnd: string | null;
  username: string | null;
  email: string | null;
  error?: string;
}

interface CostsPayload {
  llm: OpenRouterUsage;
  apify: ApifyUsage;
}

/**
 * Format USD to $X.YYYY for OpenRouter (which often shows fractional
 * cents) and to $X.YY for Apify (denominator already at cent level).
 */
function fmtUsd(n: number, digits = 2): string {
  return `$${n.toFixed(digits)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Map raw Apify service codes ("ACTOR_COMPUTE_UNITS") to the labels
 *  Apify uses on its own dashboard. Anything not in the map renders
 *  the raw code so we never hide an unfamiliar service. */
const APIFY_SERVICE_LABELS: Record<string, string> = {
  ACTOR_COMPUTE_UNITS: "Actor compute units",
  DATASET_READS: "Dataset reads",
  DATASET_WRITES: "Dataset writes",
  DATASET_TIMED_STORAGE_GBYTE_HOURS: "Dataset storage (GB·h)",
  KEY_VALUE_STORE_READS: "Key-value reads",
  KEY_VALUE_STORE_WRITES: "Key-value writes",
  KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS: "Key-value storage (GB·h)",
  KEY_VALUE_STORE_LISTS: "Key-value list ops",
  REQUEST_QUEUE_READS: "Request queue reads",
  REQUEST_QUEUE_WRITES: "Request queue writes",
  REQUEST_QUEUE_TIMED_STORAGE_GBYTE_HOURS: "Request queue storage (GB·h)",
  PROXY_RESIDENTIAL_TRANSFER_GBYTES: "Residential proxy traffic (GB)",
  PROXY_DATACENTER_TRANSFER_GBYTES: "Datacenter proxy traffic (GB)",
  PROXY_SERPS: "SERP proxy requests",
  EXTERNAL_PROXY_TRAFFIC_GBYTES: "External proxy traffic (GB)",
  ACTOR_BUILD_COMPUTE_UNITS: "Actor build compute",
};

export function CostsContent() {
  const [data, setData] = useState<CostsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchCosts() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/costs", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CostsPayload;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCosts();
  }, []);

  const llm = data?.llm;
  const apify = data?.apify;
  const llmRemaining =
    llm?.limit != null ? Math.max(0, llm.limit - llm.usage) : null;
  const llmPct = llm?.limit ? Math.min(100, (llm.usage / llm.limit) * 100) : 0;

  const apifyOverPlan =
    apify && apify.monthlyCreditsUsd != null
      ? Math.max(0, apify.monthlyUsageUsd - apify.monthlyCreditsUsd)
      : 0;
  const apifyPct =
    apify && apify.monthlyCreditsUsd
      ? Math.min(100, (apify.monthlyUsageUsd / apify.monthlyCreditsUsd) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          onClick={fetchCosts}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      {/* ─── OpenRouter (LLM) ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            OpenRouter — LLM (AI Creative Analysis)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {llm?.error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{llm.error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Usage (cycle)"
              value={fmtUsd(llm?.usage ?? 0, 4)}
              hint="Total cost on the API key since cycle start"
            />
            <Stat
              label="Spending limit"
              value={
                llm?.limit != null ? fmtUsd(llm.limit, 2) : "No limit"
              }
              hint={
                llm?.limit != null
                  ? "Cap configured on OpenRouter"
                  : "Configure on dashboard to enforce"
              }
            />
            <Stat
              label="Remaining"
              value={
                llmRemaining != null ? fmtUsd(llmRemaining, 2) : "—"
              }
              hint={
                llmRemaining != null && llmRemaining < 5
                  ? "Low balance — top up the OpenRouter key"
                  : "Available for AI calls"
              }
              warn={llmRemaining != null && llmRemaining < 5}
            />
          </div>

          {llm?.limit && (
            <div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gold transition-all"
                  style={{ width: `${llmPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                <span>{llmPct.toFixed(1)}% used</span>
                <span>
                  {fmtUsd(llm.usage, 4)} of {fmtUsd(llm.limit, 2)}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-2 text-xs pt-3 border-t border-border">
            <KvRow
              label="API key label"
              value={llm?.label ?? "Unnamed"}
            />
            <KvRow
              label="Tier"
              value={
                llm?.is_free_tier ? (
                  <Badge variant="outline">Free tier</Badge>
                ) : (
                  <Badge variant="gold">Paid</Badge>
                )
              }
            />
            {llm?.rate_limit && (
              <KvRow
                label="Rate limit"
                value={`${llm.rate_limit.requests} req / ${llm.rate_limit.interval}`}
              />
            )}
            <KvRow
              label="Dashboard"
              value={
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline"
                >
                  Open OpenRouter <ExternalLink className="size-3" />
                </a>
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Apify ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="size-4 text-gold" />
            Apify — Scrapers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {apify?.error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{apify.error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Usage (cycle)"
              value={fmtUsd(apify?.monthlyUsageUsd ?? 0, 2)}
              hint="Sum of all paid services this billing cycle"
            />
            <Stat
              label="Plan credits"
              value={
                apify?.monthlyCreditsUsd != null
                  ? fmtUsd(apify.monthlyCreditsUsd, 2)
                  : "—"
              }
              hint={
                apify?.planId
                  ? `Included in ${apify.planId} plan`
                  : "Plan information unavailable"
              }
            />
            <Stat
              label="Over plan"
              value={fmtUsd(apifyOverPlan, 2)}
              hint={
                apifyOverPlan > 0
                  ? "Billed on top of the base monthly fee"
                  : "Within plan allowance"
              }
              warn={apifyOverPlan > 0}
            />
          </div>

          {apify?.monthlyCreditsUsd != null && (
            <div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={
                    apifyPct >= 100
                      ? "h-full bg-amber-400 transition-all"
                      : "h-full bg-gold transition-all"
                  }
                  style={{ width: `${apifyPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                <span>{apifyPct.toFixed(1)}% used</span>
                <span>
                  {fmtUsd(apify.monthlyUsageUsd, 2)} of{" "}
                  {fmtUsd(apify.monthlyCreditsUsd, 2)}
                </span>
              </div>
            </div>
          )}

          {/* Service breakdown — top cost lines */}
          {apify && apify.breakdown.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cost by service (top 6)
              </p>
              <div className="rounded-md border border-border divide-y divide-border">
                {apify.breakdown.slice(0, 6).map((row) => (
                  <div
                    key={row.service}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs items-center"
                  >
                    <span className="text-foreground/80 truncate">
                      {APIFY_SERVICE_LABELS[row.service] ?? row.service}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.quantity.toLocaleString("en-US", {
                        maximumFractionDigits: 4,
                      })}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {fmtUsd(row.amountUsd, 4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 text-xs pt-3 border-t border-border">
            <KvRow label="Account" value={apify?.username ?? apify?.email ?? "—"} />
            <KvRow
              label="Plan"
              value={
                apify?.planId ? (
                  <Badge variant="gold">{apify.planId}</Badge>
                ) : (
                  "—"
                )
              }
            />
            {apify?.planBasePriceUsd != null && (
              <KvRow
                label="Plan base fee"
                value={`${fmtUsd(apify.planBasePriceUsd, 2)} / month`}
              />
            )}
            <KvRow
              label="Cycle"
              value={`${fmtDate(apify?.cycleStart ?? null)} → ${fmtDate(apify?.cycleEnd ?? null)}`}
            />
            <KvRow
              label="Dashboard"
              value={
                <a
                  href="https://console.apify.com/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline"
                >
                  Open Apify console <ExternalLink className="size-3" />
                </a>
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={
          warn
            ? "text-2xl font-serif text-amber-400 tabular-nums"
            : "text-2xl font-serif text-gold tabular-nums"
        }
      >
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground/80 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

function KvRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
