"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Revoca un token OAuth (= disconnette il client). Ownership check:
 * il token DEVE appartenere all'utente che chiama.
 */
export async function revokeConnection(tokenId: string) {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();

  // Verifica ownership prima di revocare. Se non e' tuo → no-op
  // silente (potrebbe gia' essere stato cancellato).
  const { data: row } = await admin
    .from("mait_oauth_tokens")
    .select("id, user_id")
    .eq("id", tokenId)
    .maybeSingle();
  const token = row as { id: string; user_id: string } | null;
  if (!token) {
    throw new Error("Connessione non trovata");
  }
  if (token.user_id !== profile.id) {
    throw new Error("Non puoi revocare connessioni di altri utenti");
  }

  await admin
    .from("mait_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);

  revalidatePath("/settings/mcp");
}
