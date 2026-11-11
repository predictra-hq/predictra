# Data dictionary — quote e statistiche (M3)

Migrazioni: `supabase/migrations/20261107140000_odds_data_kind.sql`, `20261107140100_odds_core.sql` · Decisioni: [ADR 0015](../decisions/0015-quote-v1.md), [ADR 0016](../decisions/0016-de-margin.md) · Tipi: `packages/shared-types/src/odds.ts` (verificati da `supabase/tests/odds.test.ts`).

Regole comuni, come per il [calcio](football.md):

- lettura per utenti autenticati con account attivo;
- scrittura solo da `service_role` tramite `ingest_odds_batch`;
- nessun dato personale.

## Modifiche a tabelle esistenti

| Tabella                   | Modifica                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`               | nuova colonna `primary_data_kind`: il tipo di dato che decide la freschezza in `v_source_health`. Nuova riga `the-odds-api` (termini verificati il 7/11/2026) |
| `source_freshness_rules`  | `the-odds-api` / `odds` = 12 ore                                                                                                                              |
| tipo `football_data_kind` | nuovo valore `odds`                                                                                                                                           |

## Tabelle

| Tabella          | PK                       | FK                                                    | Vincoli e indici                                                                                                                                                                                                                    | Retention                    |
| ---------------- | ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `bookmakers`     | `code` (es. `codere_it`) | providers                                             | `italian_market` vero per le chiavi `*_it` (versione italiana secondo il provider, non un'autorizzazione ADM verificata)                                                                                                            | conservati                   |
| `markets`        | `code`                   | —                                                     | seed: `h2h` con selezioni `HOME`, `DRAW`, `AWAY`                                                                                                                                                                                    | statica                      |
| `odds_events`    | `id`                     | providers, competitions, matches (set null)           | unico per (`provider`, `provider_event_id`); `match_id` vuoto se non abbinato                                                                                                                                                       | conservati                   |
| `odds_snapshots` | `id`                     | odds_events (cascade), bookmakers, markets, providers | unico per (evento, bookmaker, mercato, selezione, `event_time`); `price` > 1. `event_time` = `last_update` del mercato secondo il provider; `first_observed_at` = prima lettura; `observed_at` = ultima lettura che l'ha confermata | da rivedere in M8 (ADR 0041) |

## Viste

Tutte con `security_invoker = true`.

| Vista                   | Contenuto                                                                                                                                                                                                   | Usata da                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `v_latest_odds`         | ultima quota per evento, bookmaker, mercato e selezione                                                                                                                                                     | M3, M5                                |
| `v_match_odds_h2h`      | 1X2 per evento e bookmaker (solo se le tre quote ci sono): quote, `overround`, probabilità senza margine con metodo proporzionale (ADR 0016), versione italiana, qualità, freschezza (`STALE` oltre 12 ore) | M3 corsia B (Market Intelligence), M5 |
| `v_best_odds_h2h`       | migliore quota per esito e relativo bookmaker, **solo tra le quote fresche**; numero di bookmaker e di versioni italiane                                                                                    | M3 corsia B, M5                       |
| `v_odds_coverage`       | per competizione: eventi, eventi abbinati, bookmaker, versioni italiane, ultima osservazione                                                                                                                | M3 corsia B (copertura dichiarata)    |
| `v_team_match_results`  | una riga per squadra e partita conclusa (gol fatti e subiti, casa o trasferta)                                                                                                                              | statistiche                           |
| `v_team_season_stats`   | per squadra e stagione: partite, V/N/P, gol, punti, rendimento casa e trasferta, clean sheet, entrambe a segno, over 2,5                                                                                    | M3 corsia B (Statistics Center)       |
| `v_team_form`           | ultimi 5 risultati (V/N/P, dal più recente)                                                                                                                                                                 | M3 corsia B                           |
| `v_league_season_stats` | per stagione: partite, medie gol (totale, casa, ospite), percentuali 1/X/2, over 2,5, entrambe a segno                                                                                                      | M3 corsia B (League Intelligence)     |

Le statistiche usano solo `v_match_results`: partite `FINISHED` con risultato e qualità diversa da `ERROR`.

## Funzioni

| Funzione                                               | Chi                          | Scopo                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest_odds_batch(run_id, batch)`                     | `service_role`               | Scrive un lotto di quote di una competizione (formato nel commento della migrazione). Registra i bookmaker e abbina ogni evento a una partita: stessa competizione, squadre ritrovate negli alias, calcio d'inizio entro 36 ore. Inserisce una quota solo se il `last_update` è nuovo, altrimenti aggiorna `observed_at`. Apre o chiude il problema `odds.event_unmatched` |
| `add_team_alias(team_id, alias)`                       | Super Admin con 2FA (`aal2`) | Aggiunge un alias `manual` per abbinare i nomi di fonti diverse; registrato in audit (`team_alias.added`). Subito dopo ricollega gli eventi di quote ancora senza partita, anche già giocati, e chiude i loro avvisi `odds.event_unmatched` (`app_private.rematch_odds_events`, migrazione `20261111200000`)                                                               |
| `app_private.normalize_team_name()`, `team_by_alias()` | interne                      | normalizzazione e ricerca degli alias (nessun risultato se l'alias è ambiguo)                                                                                                                                                                                                                                                                                              |
