-- ANNULLATA — non eseguire.
--
-- La premessa di questa migration era che le analisi EN dell'import
-- Meta di Born Outside fossero state generate ex-novo dal vecchio
-- sistema, perdendo le personalizzazioni della IT. L'utente ha pero'
-- confermato 2026-05-12 che le EN attuali sono GIA' corrette (sistemate
-- manualmente dopo la generazione ex-novo, oppure mai degradate),
-- quindi NON vanno cancellate.
--
-- File lasciato come no-op per non creare buchi nella numerazione
-- delle migration. Non rimuovere senza prima rinumerare le migration
-- successive.

SELECT 1 WHERE FALSE;
