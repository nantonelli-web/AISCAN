-- =====================================================================
-- AISCAN — Adv Performance AI: passaggio da tier statici (cheap/
-- pragmatic/premium) a selezione libera del modello LLM gestito in
-- Admin (mait_ai_models). Il campo model_tier ora ospita lo slug
-- mait_ai_models.model_id (es. 'claude-haiku-4-5') invece dei 3
-- tier hardcoded. Rilassiamo il CHECK constraint per permetterlo.
-- Le righe esistenti con valori 'cheap'/'pragmatic'/'premium'
-- restano valide (storia preservata).
-- =====================================================================

-- Cerca dinamicamente il nome del CHECK constraint (Postgres assegna
-- un nome auto come <table>_<col>_check, ma su DB migrati a mano puo'
-- variare). Drop sicuro che funziona anche se gia' rimosso.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'mait_perf_analyses'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%model_tier%';
  if cname is not null then
    execute format('alter table mait_perf_analyses drop constraint %I', cname);
  end if;
end$$;
