# M5 — Smart Bet Builder: piano e corsie

**Stato:** in corso (corsia 0 unita, corsia A in revisione) · **Dipende da:** M3, M4 · **Può partire quando:** i contratti di M3 e M4 (corsie 0) sono su `dev`; i risultati reali richiedono quote (M3 A) e previsioni (M4 A) su DEV · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Proporre combinazioni di selezioni (singole e multiple) costruite dalle probabilità del modello e dalle quote reali, con le correlazioni gestite in modo corretto. PREDICTRA resta uno strumento informativo: non piazza scommesse.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- **nessuna schedina forzata**: se nessuna combinazione supera le soglie, non se ne propone nessuna;
- correlazioni gestite (stessa partita: probabilità congiunta dal modello) oppure combinazione esclusa;
- versioni immutabili: ogni proposta salvata non cambia più, anche se cambiano quote o modello.

## Assegnazione

| Corsia          | Persona    | Issue | Stato                                   |
| --------------- | ---------- | ----- | --------------------------------------- |
| 0 — contratto   | `gennpalm` | —     | unita (#19)                             |
| A — motore      | `gennpalm` | —     | in revisione (PR `feature/m5-a-motore`) |
| B — interfaccia | `gennpalm` | —     | da iniziare                             |

## Prerequisiti

Nessun nuovo account o segreto. Serve che su DEV ci siano quote (M3) e previsioni (M4) reali per verificare il risultato finale.

## Cosa serve dalle altre milestone

| Da  | Cosa                                                                         | Se non è ancora su `dev`                                                                     |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| M3  | `odds_snapshots`, stato FRESH/STALE, `packages/quant` (fair odds, de-margin) | chiedere il merge della corsia 0 di M3; per i calcoli, branch in pila solo se indispensabile |
| M4  | `predictions` e la **matrice dei risultati esatti** per partita              | chiedere il merge della corsia 0 di M4; test con fixture                                     |
| M4  | Confidence Score                                                             | usare il campo del contratto anche se ancora vuoto                                           |

## Decisioni (ADR 0025–0027, proposte nella corsia 0)

- **[ADR 0025](../decisions/0025-regole-combinazioni.md) — Regole delle combinazioni:** tipi ammessi (singole, multiple, più selezioni sulla stessa partita), numero massimo di selezioni, soglie minime (EV, probabilità, Confidence Score, freschezza delle quote).
- **[ADR 0026](../decisions/0026-correlazioni.md) — Correlazioni:** stessa partita → probabilità congiunta calcolata dalla matrice dei risultati di M4; partite diverse → indipendenza dichiarata; casi non modellabili → combinazione esclusa.
- **[ADR 0027](../decisions/0027-motore-ranking-categorie.md) — Ranking e categorie:** criteri del ranking multidimensionale (per esempio EV, probabilità, varianza, Confidence Score) e categorie (per esempio per profilo di rischio). Il piano M0 non le specifica: vanno definite qui.
- **ADR 0027 — Dove gira il motore:** batch Python (nel `prediction-engine`) che produce i candidati, oppure calcolo su richiesta lato server in TypeScript. Scegliere considerando i minuti di GitHub Actions e i 300 s di Vercel.

## Corsia 0 — contratto

**File:** ADR 0025–0027, `docs/data-dictionary/bet-builder.md`, `supabase/migrations/<timestamp>_bet_builder.sql`, `supabase/tests/bet-builder.test.ts`, `packages/shared-types/src/bet-builder.ts`.

**Contenuto** (dettagli nel [data dictionary](../data-dictionary/bet-builder.md)):

- `bet_builder_runs`, `bet_proposals` e `bet_proposal_legs`: run del motore con le regole usate, proposte e selezioni con riferimento a versione del modello, previsioni e snapshot delle quote; immutabili (`app_private.forbid_mutation` di M4). Probabilità, quota combinata, EV e Confidence Score li calcola il database;
- `user_bet_slips` e `user_bet_slip_selections`: combinazioni salvate dagli utenti, private (RLS **solo proprietario**, nessun accesso admin né `service_role`, come le preferenze in M1);
- viste per l'interfaccia: `v_active_bet_proposals` (per giornata e categoria), `v_bet_proposal_legs`, `v_bet_builder_latest_run`.

**Fatto quando:** CI verde, migrazione su DEV, test RLS (inclusa l'immutabilità e l'isolamento tra utenti).

## Corsia A — motore delle combinazioni

**File di proprietà:** `services/bet-builder/**` (servizio Python separato, ADR 0027) con i suoi test, e il workflow `.github/workflows/bet-builder.yml`, avviato dopo le raccolte delle quote. Runbook: [bet-builder.md](../operations/bet-builder.md).

| Fase | Contenuto                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------- |
| A1   | Probabilità congiunte sulla stessa partita dalla matrice dei risultati; test di coerenza        |
| A2   | Generazione dei candidati con le soglie dell'ADR; esclusione delle combinazioni non modellabili |
| A3   | Ranking multidimensionale e categorie                                                           |
| A4   | Salvataggio delle proposte come versioni immutabili, con il riferimento a modello e quote usati |

**Fatto quando:** proposte reali su DEV; giornate senza combinazioni valide producono zero proposte.

## Corsia B — interfaccia

**File di proprietà:** `apps/web/src/app/(app)/bet-builder/**`, `apps/web/src/lib/bet-builder/**`, `apps/web/src/components/bet-builder/**`, la chiave `betBuilder` di `it.ts`, la riga della voce in `nav-config.ts`.

| Fase | Contenuto                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| B1   | Elenco delle proposte per categoria, con probabilità, quota, EV, Confidence Score e freschezza delle quote   |
| B2   | Dettaglio della proposta: selezioni, correlazioni, versione del modello, spiegazione                         |
| B3   | Costruzione manuale di una combinazione con valutazione e avvisi (correlazioni non modellabili, quote STALE) |
| B4   | Salvataggio privato delle combinazioni dell'utente; stato vuoto quando non ci sono proposte                  |

**Fatto quando:** voce Smart Bet Builder attiva, dati reali su DEV, disclaimer sempre visibile.

## Chiusura di M5

1. Corsie unite su `dev`, deploy DEV verde.
2. Verifica dei tre criteri di completamento su DEV.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e nella [roadmap](README.md).
