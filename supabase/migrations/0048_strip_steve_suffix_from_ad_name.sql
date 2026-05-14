-- 0048_strip_steve_suffix_from_ad_name.sql
-- One-shot data fix: rimuovi la sottostringa "_Steve" dal campo
-- ad_name della tabella mait_perf_meta_rows. Tutto il resto del
-- nome resta intatto (REPLACE preserva qualsiasi prefisso/suffisso).
-- Idempotente: se "_Steve" non c'e' (gia' fixato), il REPLACE
-- lascia il valore invariato.

-- Preview di quante row verranno toccate (commentato — uncomment
-- per eseguire come SELECT prima dell'UPDATE).
-- SELECT count(*) AS rows_to_fix
-- FROM public.mait_perf_meta_rows
-- WHERE ad_name LIKE '%\_Steve%' ESCAPE '\';

UPDATE public.mait_perf_meta_rows
SET ad_name = REPLACE(ad_name, '_Steve', '')
WHERE ad_name LIKE '%\_Steve%' ESCAPE '\';

-- Verifica post-fix (commentato).
-- SELECT count(*) AS remaining
-- FROM public.mait_perf_meta_rows
-- WHERE ad_name LIKE '%\_Steve%' ESCAPE '\';
