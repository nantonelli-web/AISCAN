-- =====================================================================
-- AISCAN — Adv Performance AI: aggiungi locale a mait_perf_analyses
-- cosi le analisi possono esistere in piu' lingue contemporaneamente
-- (es. utente switch IT ↔ EN: ogni lingua ha la propria riga, nessun
-- overwrite). Il prompt e il rendering scelgono la riga in base al
-- cookie mait-locale.
-- =====================================================================

alter table mait_perf_analyses
  add column if not exists locale text not null default 'it';

-- Validazione: solo i due locale supportati (allineato a
-- src/lib/i18n/translations.ts).
alter table mait_perf_analyses
  drop constraint if exists mait_perf_analyses_locale_check;
alter table mait_perf_analyses
  add constraint mait_perf_analyses_locale_check
    check (locale in ('it', 'en'));

-- Unique key passa da (import_id, section) a (import_id, section,
-- locale) cosi IT ed EN possono coesistere. Il vecchio constraint
-- aveva nome auto generato; lo cerchiamo dinamicamente.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'mait_perf_analyses'
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) ilike '%(import_id, section)%';
  if cname is not null then
    execute format('alter table mait_perf_analyses drop constraint %I', cname);
  end if;
end$$;

alter table mait_perf_analyses
  add constraint mait_perf_analyses_import_section_locale_key
    unique (import_id, section, locale);
