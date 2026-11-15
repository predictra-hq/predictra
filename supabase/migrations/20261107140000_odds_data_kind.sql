-- =============================================================================
-- PREDICTRA — M3 corsia 0: nuovo tipo di dato "odds"
-- =============================================================================
-- File separato: un valore aggiunto a un enum non si può usare nella stessa
-- transazione in cui viene creato (lo usa la migrazione successiva).
-- =============================================================================
alter type public.football_data_kind add value if not exists 'odds';
