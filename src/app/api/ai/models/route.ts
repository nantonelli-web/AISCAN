import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/ai/models
 * Lista dei modelli LLM attivi (catalogo gestito da Admin in
 * mait_ai_models). Restituisce solo i campi necessari al picker
 * lato dashboard — niente flag interni di sync/review.
 *
 * Auth: utente loggato qualunque (workspace member). I dati non
 * sono sensibili: sono il catalogo modelli che il workspace puo'
 * usare per pagare le analisi.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_ai_models")
    .select("model_id, display_name, provider, credits_cost, openrouter_id, supports_vision")
    .eq("is_active", true)
    .not("openrouter_id", "is", null)
    .order("credits_cost", { ascending: true })
    .order("display_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ models: data ?? [] });
}
