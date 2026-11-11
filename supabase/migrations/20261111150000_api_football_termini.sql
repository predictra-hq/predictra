-- =============================================================================
-- M2 corsia 0 — termini d'uso di API-Football verificati (11/11/2026).
-- Testo letto a mano dal proprietario da https://www.api-football.com/terms
-- (versione "Last updated: May 21, 2025"); analisi in
-- docs/data-sources/api-football.md. Con terms_verified_at valorizzato,
-- start_ingestion_run accetta il provider (fase A3 del piano M2).
-- =============================================================================

update public.providers
set terms_url         = 'https://www.api-football.com/terms',
    terms_verified_at = date '2026-11-11',
    licence_summary   = 'Piano Free: 100 richieste al giorno (azzeramento alle 00:00 UTC; raggiunto il limite l''account è sospeso fino a fine giornata), rispetto obbligatorio del limite al minuto. Un solo account per persona. Vietata la rivendita dei dati. Nessuna licenza di pubblicazione: i diritti restano a leghe e federazioni. Uso privato e interno di PREDICTRA (ADR 0004).',
    attribution       = null
where code = 'api-football';
