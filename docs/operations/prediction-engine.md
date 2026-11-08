# Motore di previsione — runbook (M4 corsia A)

Servizio Python in `services/prediction-engine/`. Decisioni: [ADR 0020](../decisions/0020-versioning-previsioni.md), [ADR 0021](../decisions/0021-modelli-v1.md), [ADR 0022](../decisions/0022-confidence-score.md). Dati: [predictions.md](../data-dictionary/predictions.md).

## Come funziona

```text
GitHub Actions "Prediction engine" (05:40 e 14:40 UTC, dopo le raccolte football-data; più l'avvio manuale)
  1. training_results(as_of = adesso)              → partite concluse fino a ora
  2. v_match_center: partite SCHEDULED dei prossimi 7 giorni
  3. per ogni modello (baseline, elo, poisson, dixon_coles), adattato per competizione:
       versione = famiglia + iperparametri + commit del codice del motore
       se la versione è nuova: register_model_version + backtest walk-forward → record_backtest
  4. per ogni modello: start_prediction_run → record_predictions (righe e matrici) → finish_prediction_run
```

- **Versioni.** Una versione non cambia finché non cambiano il codice del motore o i suoi iperparametri. A ogni esecuzione il modello si riadatta in modo deterministico sui dati di `training_results(as_of)`: versione e `as_of` bastano a riprodurre ogni previsione. Così una versione attivata continua a ricevere previsioni giorno dopo giorno.
- **Backtest.** È walk-forward a finestre settimanali, dopo 4 settimane iniziali di solo addestramento. Usa le stesse partite per tutti i modelli e registra Brier, Log Loss, ECE e i valori della baseline. Si esegue una sola volta per versione.
- **Previsioni.**
  - Baseline ed Elo producono solo l'1X2.
  - Poisson e Dixon-Coles producono tutti i mercati della v1 (98 righe per partita) e la matrice dei risultati esatti fino a 10 gol.
  - Ogni riga ha `as_of`, `features_hash` e il Confidence Score con le sue componenti in `explanation`.
- **Anti-leakage:** il database rifiuta previsioni con `as_of` successivo al calcio d'inizio. Il motore legge lo storico solo con `training_results`.

## Attivare un modello

Il modello attivo è quello mostrato come "previsione PREDICTRA" (`v_active_predictions`). Finché nessuna versione è attiva, la vista è vuota: è il comportamento voluto.

1. Guarda i backtest in `v_model_versions_summary`. `beats_baseline = true` vuol dire Brier e Log Loss migliori della baseline.
2. Un Super Admin con 2FA chiama `set_active_model_version(<id>)`. Il database rifiuta le versioni che non battono la baseline e registra l'attivazione in audit.

La pagina Model Intelligence, con un pulsante di attivazione, arriva con la corsia B di M4. Fino ad allora l'attivazione si fa dall'SQL editor di Supabase.

## Avvio manuale

_Actions → Prediction engine → Run workflow_, branch `dev`.

- `dry_run`: calcola backtest e previsioni senza scrivere nulla e stampa le metriche.
- `horizon_days`: quanti giorni di partite prevedere (predefinito 7).

Come per il Data collector, schedule e pulsante esistono solo quando il workflow è su `main`.

## Uso in locale (facoltativo)

```powershell
cd services/prediction-engine
uv sync
uv run pytest
$env:SUPABASE_URL = "https://<ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<chiave secret>"
$env:CODE_COMMIT = (git log -1 --format=%H -- .)
uv run python -m predictra_engine run --dry-run
```

## Budget

- Previsioni: 2 esecuzioni al giorno di pochi minuti.
- Backtest: solo quando cambia il codice del motore.

La stima dell'ADR 0020 è di circa 220 minuti al mese di GitHub Actions; va verificata con le prime esecuzioni reali.

## Limiti noti

- Lo storico è solo la stagione in corso: all'inizio il campione è piccolo e il Confidence Score sarà spesso basso.
- Squadre senza partite nella competizione (per esempio all'inizio della Champions League) hanno forza media.
- Gli iperparametri iniziali (Elo K = 20 e vantaggio casalingo 60; Dixon-Coles ξ = 0,0019/giorno; penalità L2 0,1) non sono ancora ottimizzati: si rivedono con i backtest reali, e ogni modifica crea una versione nuova.
