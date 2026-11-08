# Punto della situazione

**Aggiornato:** 7/11/2026, fine giornata (`Alfry1299` con Claude Code). Chi riprende il lavoro legge prima questo file, poi [CLAUDE.md](../../CLAUDE.md) e il piano della milestone in [docs/roadmap/](../roadmap/README.md).

## Cosa è in servizio su DEV

| Area                                                                        | Stato                                                                              | Dove                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| M1: accesso su invito, ruoli, 2FA, amministrazione                          | ✅                                                                                 | https://predictra-dev.vercel.app                       |
| M2: partite e classifiche delle 8 competizioni della v1 (stagione in corso) | ✅ 2.508 partite, raccolte da football-data.org                                    | Match Center, Data Center                              |
| M3 corsia 0: contratto quote, margine e statistiche                         | ✅ migrazioni applicate                                                            | `docs/data-dictionary/odds.md`                         |
| M3 corsia A: raccolta quote The Odds API, `packages/quant`                  | ✅ prima raccolta reale: 108 eventi, 51 abbinati alle partite, 491 crediti residui | PR #10, runbook [data-collector.md](data-collector.md) |

## Cosa resta da fare, in ordine

1. **M3 corsia B (interfaccia).** Piano: [M3](../roadmap/M3-statistiche-e-quote.md), corsia B. Tutte le viste sono già su DEV.
   - Market Intelligence: `v_match_odds_h2h`, `v_best_odds_h2h`, `v_odds_coverage`. Per il metodo della potenza si usa `@predictra/quant`.
   - Statistics Center: `v_team_season_stats`, `v_team_form`.
   - League Intelligence: `v_league_season_stats`, `v_latest_standings`.
   - **Pagina admin degli alias**, proposta da inserire in questa corsia. Mostra i problemi `odds.event_unmatched` (con i nomi ricevuti da The Odds API) e permette di scegliere la squadra e salvare l'alias con `add_team_alias` (Super Admin con 2FA). Serve a recuperare i **57 eventi non abbinati** della prima raccolta.
2. **Merge di `dev` in `main`** (PR `dev` → `main`, _Create a merge commit_). Senza questo passo le raccolte automatiche non partono:
   - football-data ogni 3 ore;
   - quote alle 07:23 e alle 16:37 UTC.

   Finora tutte le raccolte sono state lanciate a mano. Il job _Deploy PROD_ si salta da solo finché mancano i segreti `PROD_*`.

3. **M4 (modelli)** può partire in parallelo a M3 corsia B. Lo storico disponibile è solo la stagione in corso finché la fase A3 di M2 resta bloccata.
4. **M6 (bankroll)** è indipendente da tutto il resto.

## Punti aperti

| Punto                                                          | Stato                                                                                                                           | Chi                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Termini di API-Football (M2 fase A3, storico 2022–2024)        | non verificati: il sito blocca la lettura automatica                                                                            | `gennpalm`, a mano: [api-football.md](../data-sources/api-football.md) |
| Deploy Vercel fermo su `Building…` per i commit di `Alfry1299` | corretto: il deploy ora pubblica senza metadati git e ha un timeout. Vedi la tabella dei problemi in [ambienti.md](ambienti.md) | verificare al primo push su `dev`                                      |
| `score.fullTime` con supplementari e rigori                    | da verificare sui dati reali (segnalato come `match.score_non_regular`)                                                         | M2 corsia A                                                            |
| Fixture con risposte reali registrate                          | i test usano gli esempi ufficiali delle documentazioni                                                                          | collector                                                              |
| Date di scadenza dei token Supabase e Vercel                   | da annotare in [ambienti.md](ambienti.md)                                                                                       | `gennpalm`                                                             |

## Come lavorare in sessione

- Branch `feature/m<N>-<0|a|b>-<slug>` da `dev` aggiornato, PR verso `dev`, **Squash and merge** con CI verde ([collaborazione.md](collaborazione.md)).
- Commit: solo la riga del titolo, in italiano, senza descrizione né `Co-Authored-By` (preferenza del proprietario).
- Raccolte manuali: _Actions → Data collector → Run workflow_, branch `dev`, campo `job` (`football-data`, `odds-daily`, `odds-prematch`).
  - Con `dry_run` non scrive nulla.
  - Le quote consumano comunque crediti: circa 1 per competizione, su 500 al mese.
