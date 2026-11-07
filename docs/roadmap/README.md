# Roadmap e corsie di lavoro

Stato delle milestone, dipendenze e divisione del lavoro in corsie parallele. Le regole per lavorare in parallelo sono in [collaborazione.md](../operations/collaborazione.md); i criteri di completamento di ogni milestone vengono dal [piano tecnico M0](../architecture/M0-piano-tecnico.md) §6.

## Stato

| Milestone | Titolo                 | Dipende da | Stato                                                                               | Piano                                     |
| --------- | ---------------------- | ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| M0        | Audit e piano          | —          | completata                                                                          | [M0](../architecture/M0-piano-tecnico.md) |
| M1        | Fondazioni             | M0         | completata, **in servizio su DEV** dal 7/11/2026 (https://predictra-dev.vercel.app) | [setup](../operations/setup.md)           |
| M2        | Football data          | M1         | **prossima**                                                                        | [M2](M2-football-data.md)                 |
| M3        | Statistiche e quote    | M2         | da pianificare                                                                      | —                                         |
| M4        | Prediction engine      | M2         | da pianificare                                                                      | —                                         |
| M5        | Bet Builder            | M3, M4     | da pianificare                                                                      | —                                         |
| M6        | Bankroll e tracker     | M1, M4     | da pianificare                                                                      | —                                         |
| M7        | Agente autonomo        | M2–M5      | da pianificare                                                                      | —                                         |
| M8        | Hardening e produzione | tutte      | da pianificare                                                                      | —                                         |

Quando si inizia una milestone si crea il suo piano `M<N>-<nome>.md` copiando la struttura di [M2-football-data.md](M2-football-data.md).

## Dove si può lavorare in parallelo

```text
M2 ──┬── M3 (quote) ──────┐
     └── M4 (modelli) ──┬─┴── M5 (Bet Builder) ──┐
                        └──── M6 (bankroll) ─────┴── M7 (agente) ── M8 (produzione)
```

- **Dentro ogni milestone**: corsia 0, poi corsie A e B in parallelo.
- **Tra milestone**: dopo M2, **M3 e M4 sono indipendenti** e possono essere prese una per persona. Dopo M4, **M5 e M6** possono procedere insieme (M5 richiede anche M3).

## Corsie proposte per le prossime milestone

La divisione definitiva si decide nella corsia 0 di ogni milestone e si scrive nel suo piano.

| Milestone | Corsia 0 (contratto)                                                                         | Corsia A (dati, backend, job)                                                                               | Corsia B (interfaccia)                                                            |
| --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| M2        | modello canonico calcio, mapping provider, `ingestion_runs`, qualità; viste per la UI        | adapter football-data.org e API-Football (backfill), data quality gate, job schedulato, salute dei provider | Data Center (Source Intelligence), Match Center                                   |
| M3        | `bookmakers`, `markets`, `odds_snapshots`; funzioni di overround e de-margin con test        | adapter The Odds API, budget crediti, snapshot 1X2, stato FRESH/STALE                                       | Market Intelligence, Statistics Center, League Intelligence                       |
| M4        | `model_versions`, `predictions`, `backtests`; ADR sul versioning e sulla riproducibilità     | `services/prediction-engine` (Python): baseline, Elo, Poisson/Dixon-Coles, calibrazione, backtest temporale | Model Intelligence: metriche, versioni, explainability, Confidence Score          |
| M5        | versioni immutabili delle schedine e regole di correlazione                                  | motore delle combinazioni e delle correlazioni, ranking                                                     | Bet Builder                                                                       |
| M6        | `bankrolls`, movimenti, giocate reali e simulate, limiti personali; RLS e test di isolamento | metriche e staking (flat, Kelly frazionario limitato) con test                                              | pagine Bankroll e Tracker                                                         |
| M7        | `agent_jobs`, `agent_runs`, idempotenza (ADR 0003)                                           | coda su Postgres, QStash, worker su GitHub Actions, retry, backoff, DLQ, recovery                           | heartbeat e stato dell'agente in dashboard, notifiche, frequenza reale dichiarata |
| M8        | criteri finali e checklist di produzione                                                     | security review, backup `pg_dump` e test di restore, ambiente PROD                                          | accessibilità, runbook, verifica finale                                           |
