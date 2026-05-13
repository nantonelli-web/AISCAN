import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getClientById } from "@/lib/oauth/clients";
import { ConsentForm } from "./consent-form";

/**
 * Pagina di consenso OAuth. Vive FUORI da (dashboard) per non
 * caricare l'intera sidebar/header — qui l'utente deve solo
 * decidere se autorizzare il client.
 *
 * Quando l'utente non e' loggato, redirect a /login con
 * ?next=/oauth/consent?... cosi' dopo il login torna qui e completa
 * il flow.
 *
 * I parametri sono passati come query (preservati da /api/oauth/
 * authorize che ha gia' fatto la validation lato server).
 */

interface SearchParams {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  if (!sp.client_id || !sp.redirect_uri) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-red-600">
          Parametri OAuth mancanti. Torna al client che hai usato per avviare
          il collegamento.
        </p>
      </div>
    );
  }

  // Sessione obbligatoria. Se non loggato, salva i query nel next= e
  // redirigi a /login.
  try {
    await getSessionUser();
  } catch {
    const next = encodeURIComponent(
      `/oauth/consent?${new URLSearchParams(sp as Record<string, string>)}`,
    );
    redirect(`/login?next=${next}`);
  }
  const { profile, workspaceName } = await getSessionUser();

  const client = await getClientById(sp.client_id);
  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-red-600">Client OAuth non trovato.</p>
      </div>
    );
  }

  const scopes = (sp.scope ?? "read").split(/\s+/).filter(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md bg-background border border-border rounded-lg shadow-lg p-6 space-y-5">
        <header className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Autorizzazione
          </p>
          <h1 className="text-xl font-semibold">
            {client.client_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            vuole accedere ai tuoi dati AISCAN del workspace{" "}
            <span className="font-medium text-foreground">
              {workspaceName}
            </span>
            .
          </p>
        </header>

        <section className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {"Cosa potra' fare"}
          </p>
          <ul className="text-sm space-y-1.5">
            {scopes.includes("read") && (
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                <span>
                  Leggere brand, ads, benchmark e dati Adv Performance del tuo
                  workspace. <strong>Sola lettura</strong>: niente modifiche,
                  niente lancio scan, niente cancellazioni.
                </span>
              </li>
            )}
          </ul>
        </section>

        <section className="text-[12px] text-muted-foreground leading-relaxed">
          Autorizzando, generiamo un token associato al tuo utente
          (<span className="font-mono text-foreground">{profile.email}</span>)
          {"che il client potra' usare per chiamare l'API MCP. Puoi"}
          revocare l&apos;accesso in qualsiasi momento da{" "}
          <span className="underline">Impostazioni &rarr; MCP</span>.
        </section>

        <ConsentForm
          clientId={sp.client_id}
          redirectUri={sp.redirect_uri}
          scope={sp.scope ?? "read"}
          state={sp.state ?? ""}
          codeChallenge={sp.code_challenge ?? ""}
          codeChallengeMethod={sp.code_challenge_method ?? "S256"}
        />
      </div>
    </div>
  );
}
