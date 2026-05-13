import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { ConnectionsList } from "./connections";
import { CopySnippet } from "./copy-snippet";

/**
 * Settings → MCP — pagina di setup per i client AI che vogliono
 * collegarsi ad AISCAN via MCP. Mostra:
 *  - URL del server MCP da copiare nei config Claude Desktop / Cursor
 *  - Snippet di config copia-incolla
 *  - Lista delle connessioni attive (token OAuth emessi) con
 *    bottone Revoca per ognuna.
 */

export const dynamic = "force-dynamic";

interface ConnectionRow {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  access_token_expires_at: string;
  last_used_at: string | null;
  created_at: string;
}

export default async function McpSettingsPage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();

  // Join in JS: filtriamo i token attivi (non revocati, non scaduti)
  // dell'utente corrente e ne arricchiamo il client_name dalla
  // mait_oauth_clients.
  const { data: tokensRaw } = await admin
    .from("mait_oauth_tokens")
    .select(
      "id, client_id, scopes, access_token_expires_at, last_used_at, created_at, revoked_at",
    )
    .eq("user_id", profile.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const tokens =
    (tokensRaw as
      | (Omit<ConnectionRow, "client_name"> & { revoked_at: string | null })[]
      | null) ?? [];
  const clientIds = Array.from(new Set(tokens.map((t) => t.client_id)));
  const { data: clientsRaw } = clientIds.length
    ? await admin
        .from("mait_oauth_clients")
        .select("client_id, client_name")
        .in("client_id", clientIds)
    : { data: [] };
  const clientNameById = new Map(
    ((clientsRaw as { client_id: string; client_name: string }[] | null) ?? []).map(
      (c) => [c.client_id, c.client_name],
    ),
  );
  const connections: ConnectionRow[] = tokens.map((t) => ({
    id: t.id,
    client_id: t.client_id,
    client_name: clientNameById.get(t.client_id) ?? t.client_id,
    scopes: t.scopes,
    access_token_expires_at: t.access_token_expires_at,
    last_used_at: t.last_used_at,
    created_at: t.created_at,
  }));

  // URL canonico finale (host dopo eventuale redirect www<->apex)
  // letto dalla request headers, cosi' lo snippet copia-incolla che
  // diamo all'utente NON passa per un redirect che scarterebbe il
  // Bearer del Claude client.
  const h = await headers();
  const xfwHost = h.get("x-forwarded-host");
  const host =
    xfwHost ??
    (process.env.NEXT_PUBLIC_APP_URL ?? "https://aiscan.biz").replace(
      /^https?:\/\//,
      "",
    );
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appUrl = `${proto}://${host.replace(/\/$/, "")}`;
  const mcpUrl = `${appUrl}/api/mcp`;
  const discoveryUrl = `${appUrl}/.well-known/oauth-authorization-server`;

  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        aiscan: {
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <DynamicBackLink fallbackHref="/settings" label="Impostazioni" />

      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Integrazioni AI
        </p>
        <h1 className="text-2xl font-semibold">MCP — Model Context Protocol</h1>
        <p className="text-sm text-muted-foreground">
          Collega Claude Desktop, Cursor, ChatGPT o un altro client compatibile
          MCP ad AISCAN. Una volta autorizzato, il client puo&apos; leggere i
          tuoi brand, ads, benchmark e dati Adv Performance per produrre
          analisi e risposte. <strong>Sola lettura</strong> — nessun client
          puo&apos; modificare i dati.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>URL del server</CardTitle>
          <CardDescription>
            Incolla questo URL nel config del tuo client MCP. Il flow di
            autorizzazione (login + consenso) parte automaticamente al primo
            collegamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopySnippet label="URL" value={mcpUrl} />
          <CopySnippet label="Discovery OAuth" value={discoveryUrl} muted />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Config Claude Desktop</CardTitle>
          <CardDescription>
            Incolla questo blocco nel file di config{" "}
            <code className="font-mono text-foreground">
              claude_desktop_config.json
            </code>{" "}
            (su macOS:{" "}
            <code className="font-mono text-foreground">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>
            ) e riavvia Claude Desktop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopySnippet
            label="JSON"
            value={claudeDesktopSnippet}
            multiline
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connessioni attive</CardTitle>
          <CardDescription>
            Client che hai autorizzato e che hanno un token valido per il tuo
            utente. Revoca per disconnetterli — dopo la revoca dovranno
            ri-autorizzare per ricollegarsi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsList connections={connections} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cosa possono fare i client</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            V1 — <strong>sola lettura</strong>. I client possono chiamare 8
            tool: <code>list_brands</code>, <code>get_brand_detail</code>,
            <code> search_brand</code>, <code>list_ads</code>,
            <code> get_benchmarks</code>, <code>list_perf_imports</code>,
            <code> get_perf_dashboard</code>, <code>get_perf_analysis</code>.
          </p>
          <p>
            Niente lancio scan, niente modifiche brand, niente cancellazioni.
            Aggiungeremo azioni quando avremo conferma che il flow funziona
            stabilmente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
