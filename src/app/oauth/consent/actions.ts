"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  generateToken,
  hashToken,
  TOKEN_TTL,
  expiresAt,
} from "@/lib/oauth/tokens";
import {
  getClientById,
  isRedirectUriAllowed,
  intersectScopes,
} from "@/lib/oauth/clients";

/**
 * Server action: l'utente ha cliccato "Autorizza". Generiamo un
 * authorization_code, lo persistiamo (HASHATO) con TTL 10 min, e
 * facciamo redirect al redirect_uri originale del client con il code
 * + state.
 */
export async function approveConsent(args: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}) {
  const { profile } = await getSessionUser();
  if (!profile.workspace_id) {
    throw new Error("Workspace mancante");
  }

  const client = await getClientById(args.clientId);
  if (!client) throw new Error("Client OAuth sconosciuto");

  if (!isRedirectUriAllowed(client, args.redirectUri)) {
    throw new Error("redirect_uri non valida per questo client");
  }

  const grantedScopes = intersectScopes(
    client,
    args.scope.split(/\s+/).filter(Boolean),
  );
  if (grantedScopes.length === 0) {
    throw new Error("Nessuno scope autorizzato");
  }

  // PKCE: OBBLIGATORIO per tutti i client (OAuth 2.1). Se per
  // qualche ragione arriviamo qui senza challenge, abort.
  if (!args.codeChallenge || args.codeChallenge.length < 43) {
    throw new Error("PKCE code_challenge required (OAuth 2.1)");
  }
  if (args.codeChallengeMethod !== "S256") {
    throw new Error("code_challenge_method=S256 required");
  }

  const code = generateToken();
  const admin = createAdminClient();
  const { error } = await admin.from("mait_oauth_authorizations").insert({
    code_hash: hashToken(code),
    client_id: args.clientId,
    user_id: profile.id,
    workspace_id: profile.workspace_id,
    redirect_uri: args.redirectUri,
    scopes: grantedScopes,
    code_challenge: args.codeChallenge,
    code_challenge_method: args.codeChallengeMethod,
    expires_at: expiresAt(TOKEN_TTL.authorizationCodeSecs),
  });
  if (error) {
    logger.error(
      "insert authorization failed",
      {
        channel: "oauth/consent",
        event: "consent.persist_failed",
        clientId: args.clientId,
        userId: profile.id,
        workspaceId: profile.workspace_id,
      },
      error,
    );
    throw new Error("Errore interno");
  }
  logger.info("approved", {
    channel: "oauth/consent",
    event: "consent.approved",
    clientId: args.clientId,
    userId: profile.id,
    workspaceId: profile.workspace_id,
    redirectUri: args.redirectUri,
    scopes: grantedScopes.join(","),
  });

  const params = new URLSearchParams({
    code,
    ...(args.state ? { state: args.state } : {}),
  });
  redirect(`${args.redirectUri}?${params}`);
}

/**
 * Server action: utente ha cliccato "Rifiuta". Redirect al client con
 * error=access_denied (RFC 6749 §4.1.2.1).
 */
export async function denyConsent(args: {
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    error: "access_denied",
    error_description: "User denied the authorization request",
    ...(args.state ? { state: args.state } : {}),
  });
  redirect(`${args.redirectUri}?${params}`);
}
