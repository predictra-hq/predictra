# Data dictionary — bankroll e tracker (M6)

Migrazione: `supabase/migrations/20261108140000_bankroll.sql` · Decisioni: [ADR 0030](../decisions/0030-bankroll-dati-e-privacy.md), [ADR 0031](../decisions/0031-staking.md) · Tipi: `packages/shared-types/src/bankroll.ts`, verificati da `supabase/tests/bankroll.test.ts`.

**Dati personali e finanziari.**

- RLS **solo proprietario** su tutte le tabelle: il bankroll deve avere `user_id = auth.uid()` e l'account deve essere attivo.
- **Nessuna policy per gli amministratori**, nemmeno per i Super Admin. Un test verifica che le policy non citino ruoli amministrativi.
- `anon` non ha privilegi.
- Nessun dato del bankroll finisce in `audit_logs`.

## Tabelle

| Tabella              | PK            | FK                                                                     | Vincoli                                                                                                                                                                                                                                       | Retention                                              |
| -------------------- | ------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bankrolls`          | `id`          | `user_id` → profiles (cascade)                                         | nome unico per utente; `kind` `REAL` o `SIMULATED`; valuta `EUR`; `flat_stake_pct` tra 0,1% e 5%; il proprietario non cambia; sito dove si gioca: `bookmaker_code` (→ bookmakers, set null) e `bookmaker_name` fino a 60 caratteri (ADR 0051) | finché l'utente non lo cancella; cascade con l'account |
| `bankroll_movements` | `id`          | bankrolls (cascade)                                                    | `DEPOSIT` e `WITHDRAWAL` > 0; `ADJUSTMENT` ≠ 0 (con segno)                                                                                                                                                                                    | come il bankroll                                       |
| `bets`               | `id`          | bankrolls (cascade), matches, bet_proposals, model_versions (set null) | partita o descrizione obbligatoria; quota > 1; stake > 0; `OPEN` ⇔ `settled_at` vuoto; non cambia bankroll; `payout` calcolato dallo stato (inserito dall'utente solo per `CASHED_OUT`)                                                       | come il bankroll                                       |
| `personal_limits`    | `bankroll_id` | bankrolls (cascade)                                                    | `max_stake`, `max_open_bets`, `max_daily_loss`, `max_weekly_loss`, tutti facoltativi e > 0                                                                                                                                                    | come il bankroll                                       |

## Incasso per stato

| Stato        | Incasso                   |
| ------------ | ------------------------- |
| `OPEN`       | vuoto                     |
| `WON`        | stake × quota             |
| `LOST`       | 0                         |
| `VOID`       | stake                     |
| `HALF_WON`   | stake/2 × quota + stake/2 |
| `HALF_LOST`  | stake/2                   |
| `CASHED_OUT` | inserito dall'utente      |

## Limiti personali

Il trigger `check_personal_limits` li controlla all'inserimento di una giocata aperta e la rifiuta (codice `23514`) se:

- lo stake supera `max_stake`;
- le giocate aperte sono già `max_open_bets`;
- la perdita delle giocate chiuse nelle ultime 24 ore (o negli ultimi 7 giorni) ha già raggiunto `max_daily_loss` (o `max_weekly_loss`).

## Viste

Tutte con `security_invoker`: ognuno vede solo i propri dati.

| Vista                | Contenuto                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v_bets`             | giocate con `profit` (incasso − stake, vuoto se aperta), tipo e nome del bankroll                                                                            |
| `v_bankroll_summary` | per bankroll: depositi, prelievi, rettifiche, profitto delle giocate chiuse, stake aperti, **saldo**, **disponibile**, giocate aperte e chiuse, stake chiusi |

## Funzioni

| Funzione                                                                                                | Scopo                                                                      |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `app_private.owns_bankroll(id)`                                                                         | usata dalle policy: il bankroll è dell'utente corrente, con account attivo |
| trigger `compute_bet_payout`, `check_personal_limits`, `protect_bankroll_owner`, `protect_bet_bankroll` | incasso, limiti, proprietario e bankroll immutabili                        |

## Metriche e stake suggerito (`packages/bankroll`, M6 corsia A)

Funzioni TypeScript senza accesso al database. Lavorano sulle righe di `v_bets` e `bankroll_movements` dell'utente e calcolano in centesimi interi. Reali e simulate si calcolano sempre separatamente (`metricsByKind`).

| Metrica                 | Definizione                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Profitto                | Σ (incasso − stake) delle giocate chiuse                                                                                |
| Yield                   | profitto / Σ stake delle giocate chiuse                                                                                 |
| ROI                     | profitto / capitale netto versato (depositi − prelievi); vuoto se il capitale non è positivo                            |
| Percentuale di successo | giocate chiuse in profitto / giocate chiuse esclusi i `VOID`                                                            |
| Quota media             | media delle quote delle giocate chiuse                                                                                  |
| Drawdown massimo        | massima discesa del profitto cumulato dal picco, in ordine di chiusura; in % sul capitale netto versato più il picco    |
| CLV approssimato        | quota presa / quota di chiusura − 1. La chiusura è l'ultima quota dei propri snapshot (M3) non oltre il calcio d'inizio |

Stake suggerito (ADR 0031):

- **flat:** `flatStake`, l'1% del disponibile per difetto;
- **Kelly frazionario limitato:** `kellyStake`, un quarto di Kelly con tetto al 2%; 0 se il valore atteso non è positivo;
- **`suggestStake`:** combina i due e rispetta `max_stake`;
- **`checkLimits`:** ripete i controlli del trigger per avvisare prima del salvataggio. Il database resta l'unica garanzia.

Le metriche vuote restano `null`: non si mostrano zeri inventati.
