# ADR 0012 — Statistiche e formazioni delle partite

**Stato:** Accettata (richiesta del proprietario, 11/11/2026; si accetta con il merge) · **Data:** 2026-11-11 · **Milestone:** M2 (fase A3)

## Contesto

API-Football (piano Free, stagioni 2022–2024, [scheda](../data-sources/api-football.md)) fornisce per ogni partita le statistiche di squadra e le formazioni. Il parametro `ids` (fino a 20 partite per chiamata) non è disponibile nel piano Free (verificato il 12/11/2026). Si usano gli endpoint per partita `/fixtures/statistics` e `/fixtures/lineups`, una richiesta ciascuno.

Il formato è nella documentazione v3:

- `fixtures/statistics`: un elenco `{type, value}` per squadra ("Shots on Goal", "Ball Possession": "32%", …). Il valore può essere `null`;
- `fixtures/lineups`: modulo, allenatore, titolari (`startXI`) e panchina (`substitutes`), con id, nome, numero, ruolo (`pos` G/D/M/F) e posizione in campo (`grid`).

football-data.org (piano Free) non fornisce questi dati. Il modello dati M2 (ADR 0010) non li prevedeva.

## Decisione

1. **Statistiche in formato lungo** (`match_team_statistics`), una riga per voce:
   - la voce è il nome del provider in snake_case (`shots_on_goal`, `passes_pct`);
   - il valore è numerico, con le percentuali 0–100.

   Si salva esattamente ciò che il provider manda, comprese voci non presenti nell'esempio della documentazione. Nessuna colonna inventata e nessun cambio di schema se il provider aggiunge voci.

2. **Formazioni in due tabelle:**
   - `match_lineups`: modulo e allenatore, per squadra e partita;
   - `match_lineup_players`: giocatori, con `is_starter`.

   I giocatori restano identificati dall'ID del provider: non esiste ancora una tabella canonica dei giocatori (servirà solo con una seconda fonte di formazioni).

3. **Provenienza** (regola 4): ogni riga conserva provider, ID partita del provider, `observed_at`, `event_time`, qualità ed esecuzione. La licenza è quella del provider (`providers`).
4. **Scrittura** solo con `ingest_match_details(run_id, batch)` (`service_role`):
   - partite e squadre si ritrovano tramite `provider_entity_map`; quelle non mappate si saltano;
   - rieseguire non duplica: le statistiche si aggiornano e la rosa si riscrive per intero.
5. **Lettura:** utenti attivi (RLS), come il resto dei dati calcistici.

Migrazione `20261111220000_match_details.sql`, tipi in `packages/shared-types/src/football.ts`, test in `supabase/tests/match-details.test.ts`.

## Conseguenze

- Il backfill dei dettagli costa 2 richieste per partita: circa 44 partite al giorno, quindi circa 6 mesi per tutte le 24 stagioni, partendo dal 2024, con ripresa automatica. Resta a costo zero: un piano a pagamento richiederebbe l'approvazione del proprietario (regola 7).
- I dati sono solo storici (2022–2024): il piano Free non dà la stagione in corso. Servono per le statistiche di squadra e per modelli futuri (per esempio basati sui tiri). Oggi i modelli in gara usano i gol (ADR 0024).
- Le pagine (corsia B) potranno mostrare statistiche e formazioni nel dettaglio partita e medie per squadra.
