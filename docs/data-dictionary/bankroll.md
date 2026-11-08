# Data dictionary — bankroll e tracker (M6)

Migrazione: `supabase/migrations/20261108140000_bankroll.sql` · Decisioni: [ADR 0030](../decisions/0030-bankroll-dati-e-privacy.md), [ADR 0031](../decisions/0031-staking.md) · Tipi: `packages/shared-types/src/bankroll.ts`, verificati da `supabase/tests/bankroll.test.ts`.

**Dati personali e finanziari.**

- RLS **solo proprietario** su tutte le tabelle: il bankroll deve avere `user_id = auth.uid()` e l'account deve essere attivo.
- **Nessuna policy per gli amministratori**, nemmeno per i Super Admin. Un test verifica che le policy non citino ruoli amministrativi.
- `anon` non ha privilegi.
- Nessun dato del bankroll finisce in `audit_logs`.

## Tabelle

| Tabella              | PK            | FK                                                                     | Vincoli                                                                                                                                                                                 | Retention                                              |
| -------------------- | ------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bankrolls`          | `id`          | `user_id` → profiles (cascade)                                         | nome unico per utente; `kind` `REAL` o `SIMULATED`; valuta `EUR`; `flat_stake_pct` tra 0,1% e 5%; il proprietario non cambia                                                            | finché l'utente non lo cancella; cascade con l'account |
| `bankroll_movements` | `id`          | bankrolls (cascade)                                                    | `DEPOSIT` e `WITHDRAWAL` > 0; `ADJUSTMENT` ≠ 0 (con segno)                                                                                                                              | come il bankroll                                       |
| `bets`               | `id`          | bankrolls (cascade), matches, bet_proposals, model_versions (set null) | partita o descrizione obbligatoria; quota > 1; stake > 0; `OPEN` ⇔ `settled_at` vuoto; non cambia bankroll; `payout` calcolato dallo stato (inserito dall'utente solo per `CASHED_OUT`) | come il bankroll                                       |
| `personal_limits`    | `bankroll_id` | bankrolls (cascade)                                                    | `max_stake`, `max_open_bets`, `max_daily_loss`, `max_weekly_loss`, tutti facoltativi e > 0                                                                                              | come il bankroll                                       |

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
