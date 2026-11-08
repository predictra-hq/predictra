# Data dictionary — modelli e previsioni (M4)

Migrazione: `supabase/migrations/20261108100000_predictions.sql` · Decisioni: [ADR 0020](../decisions/0020-versioning-previsioni.md), [ADR 0021](../decisions/0021-modelli-v1.md), [ADR 0022](../decisions/0022-confidence-score.md) · Tipi: `packages/shared-types/src/predictions.ts`, verificati da `supabase/tests/predictions.test.ts`.

Regole comuni:

- **Lettura:** utenti autenticati con account attivo.
- **Scrittura:** solo il motore (`service_role`) tramite funzioni.
- **Attivazione di un modello:** solo un Super Admin (`models.manage`) con 2FA.
- **Immutabilità:** versioni, previsioni, matrici e backtest non si modificano né si cancellano (trigger). Delle versioni cambiano solo lo stato e i campi di attivazione.
- **Dati personali:** nessuno.

## Tabelle

| Tabella                     | PK   | FK                                       | Vincoli e indici                                                                                                                                                                                                                                                              | Retention                    |
| --------------------------- | ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `model_versions`            | `id` | `activated_by` → profiles                | unica per (`model_key`, `version`); `model_key` ∈ `baseline`, `elo`, `poisson`, `dixon_coles`; `training_data_hash` SHA-256; **al più una versione `ACTIVE`**                                                                                                                 | conservate                   |
| `prediction_runs`           | `id` | model_versions                           | `RUNNING` ⇔ `finished_at` vuoto; quelle aperte da più di 1 h si chiudono come `FAILED` all'avvio successivo                                                                                                                                                                   | da definire in M8            |
| `predictions`               | `id` | matches, model_versions, prediction_runs | unica per (partita, versione, mercato, linea, selezione, `as_of`); `probability` e `push_probability` ∈ [0,1] con somma ≤ 1; linea obbligatoria solo per i mercati con linea, multipla di 0,5; `as_of` ≤ calcio d'inizio (**anti-leakage**, trigger); `features_hash` SHA-256 | da definire in M8 (ADR 0041) |
| `prediction_score_matrices` | `id` | matches, model_versions, prediction_runs | unica per (partita, versione, `as_of`); `matrix` ha `max_goals + 1` righe; stesso controllo anti-leakage                                                                                                                                                                      | come `predictions`           |
| `backtests`                 | `id` | model_versions (modello e baseline)      | metodo `walk_forward`, mercato `1X2`; Brier e Log Loss obbligatori; baseline in coppia                                                                                                                                                                                        | conservati                   |

## Viste

| Vista                      | Contenuto                                                                                                                                                         | Usata da                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `v_active_predictions`     | ultima previsione del **modello attivo** per partita, mercato, linea e selezione, con calcio d'inizio, squadre, Confidence Score, spiegazione, `as_of` e versione | M4 corsia B (dettaglio partita), M5 |
| `v_model_versions_summary` | ogni versione con l'ultimo backtest: Brier, Log Loss, ECE, valori della baseline, `beats_baseline`, curva di calibrazione                                         | M4 corsia B (Model Intelligence)    |

## Funzioni

| Funzione                                                               | Chi                   | Scopo                                                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training_results(as_of)`                                              | motore, utenti attivi | partite concluse con `kickoff_at < as_of`: l'unico accesso allo storico per l'addestramento                                                                             |
| `register_model_version(p)`                                            | `service_role`        | registra una versione; se esiste già con stessi dati e codice restituisce la stessa, altrimenti errore                                                                  |
| `start_prediction_run(model_version_id, code_commit, triggered_by)`    | `service_role`        | apre un'esecuzione del motore                                                                                                                                           |
| `record_predictions(run_id, batch)`                                    | `service_role`        | scrive previsioni e matrici (formato nel commento della migrazione); rieseguirlo non duplica nulla                                                                      |
| `finish_prediction_run(run_id, status, matches_scored, error_summary)` | `service_role`        | chiude l'esecuzione                                                                                                                                                     |
| `record_backtest(p)`                                                   | `service_role`        | registra un backtest                                                                                                                                                    |
| `set_active_model_version(id)`                                         | Super Admin con 2FA   | attiva una versione solo se ha un backtest migliore della baseline su Brier **e** Log Loss; ritira la versione attiva precedente; registra in audit (`model.activated`) |
