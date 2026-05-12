-- One-off retrofit: cancella le analisi EN sbagliate di Born Outside
-- Meta. Erano state generate ex-novo dal vecchio sistema al cambio
-- lingua, perdendo le personalizzazioni che l'utente aveva fatto
-- nella versione IT. Con l'auto-translate attivo dopo il commit
-- 08bc09b, una volta cancellate queste righe l'utente cambia lingua
-- a EN e parte automaticamente la traduzione dalla IT personalizzata.
--
-- Idempotente: se le righe non esistono, DELETE non fa niente.
-- Non riguarda altre lingue: la IT con le personalizzazioni resta
-- intatta perche' la clausola locale='en' la esclude.

DELETE FROM mait_perf_analyses
WHERE locale = 'en'
  AND import_id IN (
    SELECT i.id
    FROM mait_perf_imports i
    JOIN mait_competitors c ON c.id = i.competitor_id
    WHERE c.page_name = 'Born Outside'
      AND i.channel = 'meta'
  );
