# Data dictionary — Smart Bet Builder (M5)

Migrazione: `supabase/migrations/20261108120000_bet_builder.sql` · Decisioni: [ADR 0025](../decisions/0025-regole-combinazioni.md), [ADR 0026](../decisions/0026-correlazioni.md), [ADR 0027](../decisions/0027-motore-ranking-categorie.md) · Tipi: `packages/shared-types/src/bet-builder.ts`, verificati da `supabase/tests/bet-builder.test.ts`.

Regole comuni:

- **Proposte (run, proposte, selezioni):** lettura per utenti autenticati con account attivo; scrittura solo dal motore (`service_role`) tramite funzioni.
- **Immutabilità:** proposte e selezioni non si modificano né si cancellano (trigger `app_private.forbid_mutation`, lo stesso di M4). Delle run cambiano solo stato e contatori.
- **Schedine degli utenti:** private. RLS **solo proprietario** con account attivo; nessuna policy per Admin o Super Admin; nessun privilegio nemmeno alla chiave secret (`service_role`).
- **Dati personali:** solo nelle schedine (nome, note, selezioni scelte).

## Tabelle

| Tabella                    | PK   | FK                                                                            | Vincoli e indici                                                                                                                                                                                                                | Retention                       |
| -------------------------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `bet_builder_runs`         | `id` | model_versions                                                                | `rules` (soglie ADR 0025, tutte obbligatorie); `RUNNING` ⇔ `finished_at` vuoto; quelle aperte da più di 1 h si chiudono come `FAILED` all'avvio successivo                                                                      | da definire in M8               |
| `bet_proposals`            | `id` | bet_builder_runs, model_versions, prediction_score_matrices                   | unica per (run, `slate_date`, `category`, `rank`); `SINGLE` ⇔ 1 selezione; `SAME_MATCH` ⇔ `score_matrix_id` presente; `probability` ∈ (0,1], `combined_price` > 1, `expected_value` > −1; **immutabile**                        | da definire in M8 (ADR 0041)    |
| `bet_proposal_legs`        | `id` | bet_proposals, matches, predictions, odds_snapshots, bookmakers               | unica per (proposta, `leg_no`) e (proposta, previsione); copia di mercato, linea, esito, probabilità, Confidence Score, bookmaker, quota, `event_time` e `observed_at` della quota al momento della generazione; **immutabile** | come `bet_proposals`            |
| `user_bet_slips`           | `id` | profiles (`user_id`, cancellazione a cascata), bet_proposals                  | `name` 1–80 caratteri, `notes` ≤ 1.000; `user_id` = `auth.uid()` (predefinito e verificato dalla policy); `updated_at` automatico                                                                                               | finché l'utente non la cancella |
| `user_bet_slip_selections` | `id` | (`slip_id`, `user_id`) → user_bet_slips, matches, predictions, odds_snapshots | unica per (schedina, `leg_no`), `leg_no` 1–10; mercati e selezioni come `predictions`; previsione e quota facoltative ma, se presenti, coerenti con partita, mercato, linea ed esito (trigger)                                  | come la schedina                |

Le proposte e le selezioni referenziano previsioni e quote con `on delete restrict`: la politica di conservazione di M8 dovrà tenerne conto.

## Viste

| Vista                      | Contenuto                                                                                                                                                                                                                                                                                 | Usata da                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `v_active_bet_proposals`   | proposte dell'**ultima run riuscita**, del modello attivo, con il primo calcio d'inizio ancora da venire; giornata (`slate_date`), categoria, posizione, valori calcolati, versione del modello, numero di selezioni con quota ora STALE (`legs_stale`) o cambiata (`legs_price_changed`) | M5 corsia B (elenco, B1)      |
| `v_bet_proposal_legs`      | selezioni di ogni proposta con partita, squadre, bookmaker, quota usata e quota, lettura e freschezza **attuali**                                                                                                                                                                         | M5 corsia B (dettaglio, B2)   |
| `v_bet_builder_latest_run` | ultima run in qualsiasi stato, con regole, candidati valutati, proposte scritte e versione del modello                                                                                                                                                                                    | M5 corsia B (stato vuoto, B4) |

Una run riuscita con zero proposte svuota `v_active_bet_proposals`: è il criterio "nessuna schedina forzata".

## Funzioni

| Funzione                                                                      | Chi            | Scopo                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start_bet_builder_run(model_version_id, code_commit, rules, triggered_by)`   | `service_role` | apre una run; richiede il **modello attivo** e regole complete e valide (`min_expected_value` > 0)                                                                                                                                                                                                                             |
| `record_bet_proposals(run_id, batch)`                                         | `service_role` | scrive le proposte. Il motore indica categoria, posizione, `rank_score`, spiegazione e le coppie (previsione, quota); il database calcola tipo, probabilità, quota combinata, EV, Confidence Score e giornata, e **rifiuta l'intero lotto** se una proposta viola le regole (ADR 0025 §3, 0026). Rieseguirlo non duplica nulla |
| `finish_bet_builder_run(run_id, status, candidates_evaluated, error_summary)` | `service_role` | chiude la run                                                                                                                                                                                                                                                                                                                  |

Formato del lotto:

```json
{
  "proposals": [
    {
      "category": "BALANCED",
      "rank": 1,
      "rank_score": 0.2,
      "explanation": { "correlation": "independence" },
      "legs": [
        { "prediction_id": 101, "odds_snapshot_id": 2001 },
        { "prediction_id": 205, "odds_snapshot_id": 2042 }
      ]
    }
  ]
}
```

Controlli di `record_bet_proposals` su ogni selezione: previsione del modello della run e più recente; quota della stessa partita, dello stesso esito (1X2 ↔ `h2h`), ultima per bookmaker, qualità `OK` e FRESH; partita `SCHEDULED` e non iniziata; nessun rimborso; partita e squadre non già presenti nella combinazione; soglie per selezione. Sulla combinazione: numero di selezioni, posizione entro `max_proposals_per_category`, probabilità, EV e Confidence Score minimi.
