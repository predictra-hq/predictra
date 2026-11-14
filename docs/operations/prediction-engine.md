# Motore di previsione — runbook (M4 corsia A)

Servizio Python in `services/prediction-engine/`. Decisioni: [ADR 0020](../decisions/0020-versioning-previsioni.md), [ADR 0021](../decisions/0021-modelli-v1.md), [ADR 0022](../decisions/0022-confidence-score.md). Dati: [predictions.md](../data-dictionary/predictions.md).

## Come funziona

```text
GitHub Actions "Agent (Python)" (03:47 e 12:47 UTC: job predictions.run della coda, dopo la raccolta dello stesso ciclo, M7)
oppure "Prediction engine" (solo avvio manuale: run, tune, diagnose)
  1. training_results(as_of = adesso)              → partite concluse fino a ora
  2. v_match_center: partite SCHEDULED dei prossimi 10 giorni
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

## Un modello PREDICTRA e uno sfidante (ADR 0024)

In gara ci sono solo **Poisson** e **Dixon-Coles** (dal 14/11/2026 Dixon-Coles è combinato con l'Elo, [ADR 0039](../decisions/0039-sfidante-dixon-coles-elo.md)), gli unici che calcolano tutti i mercati del Bet Builder: uno è il modello attivo, l'altro lo sfidante. Baseline ed Elo restano strumenti interni del motore: la baseline come riferimento del backtest, Elo come secondo parere per il Confidence Score. Non si registrano più e non scrivono previsioni. Le versioni superate si ritirano da sole e restano nello storico della pagina.

## Modello attivo: automatico (ADR 0023)

Dall'11/11/2026 il motore attiva da solo il modello più forte: tra le versioni del codice corrente che battono la baseline, quella con il Log Loss più basso nel backtest. La cambia se il modello attivo è di un codice superato, oppure se un'altra versione lo batte di almeno 0,001 di Log Loss. Ogni cambio compare in _Audit_ come `model.auto_activated`, con il motivo.

Ogni 7 giorni il motore rifà il backtest di tutti i modelli con i dati aggiornati e ripete la scelta (confronto settimanale).

Una versione nuova nasce solo quando cambia il codice che produce i numeri (`models/`, `data.py`, `markets.py`, `confidence.py`): il log di ogni esecuzione riporta `codice dei modelli: <impronta>`.

L'attivazione manuale descritta sotto resta possibile; il motore la cambia solo se trova un modello più forte.

## Attivare un modello

Il modello attivo è quello mostrato come "previsione PREDICTRA" (`v_active_predictions`). Finché nessuna versione è attiva, la vista è vuota: è il comportamento voluto.

1. Guarda i backtest in `v_model_versions_summary`. `beats_baseline = true` vuol dire Brier e Log Loss migliori della baseline.
2. Un Super Admin con 2FA chiama `set_active_model_version(<id>)`. Il database rifiuta le versioni che non battono la baseline e registra l'attivazione in audit.

La pagina Model Intelligence, con un pulsante di attivazione, arriva con la corsia B di M4. Fino ad allora l'attivazione si fa dall'SQL editor di Supabase.

## Avvio manuale

_Actions → Prediction engine → Run workflow_, branch `dev`.

- `dry_run`: calcola backtest e previsioni senza scrivere nulla e stampa le metriche.
- `horizon_days`: quanti giorni di partite prevedere (predefinito 10).

Dall'8/11/2026 (M7 fase A5) le esecuzioni programmate passano dalla coda dell'agente: finestre `morning` 03–12 UTC e `afternoon` 12–21 UTC, una esecuzione per finestra, al massimo 2 tentativi, il commit calcolato come prima (ultimo commit di `services/prediction-engine`, ADR 0020; nell'agente si chiama `PREDICTION_ENGINE_COMMIT`). Le versioni di numpy e scipy dell'agente sono verificate uguali a quelle del motore da un test ([runbook dell'agente](agent.md)). Come per il Data collector, il pulsante _Run workflow_ esiste solo quando il workflow è su `main`.

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

## Diagnosi: cosa vede l'app

Se il pannello "Previsioni PREDICTRA" resta vuoto: _Run workflow_ con `command = diagnose`, oppure `python -m predictra_engine diagnose`. Il comando gira in sola lettura con la chiave secret e mostra:

- versioni, stato, backtest e numero di previsioni;
- la versione attiva;
- le partite in programma nei 10 giorni;
- quante di queste la vista `v_active_predictions` restituisce.

Chiude con un **esito**: nessun modello attivo, versione attiva senza previsioni, vista che non restituisce righe, oppure dati corretti (problema lato utente).

Il pannello stesso indica il motivo quando è vuoto: nessun modello attivo, partita già iniziata o conclusa, oppure partita non ancora valutata dal motore.

## Taratura dei modelli gol

Comando in sola lettura: `python -m predictra_engine tune [--l2 2,3,4] [--xi 0,0.005]`, oppure _Run workflow_ con `command` = `tune` e `tune_args`. Per ogni combinazione esegue lo stesso backtest walk-forward delle versioni, sulle stesse partite della baseline.

**8/11/2026:** 744 partite di addestramento, backtest su 560.

| Modello                                      | Brier      | Log Loss   | ECE       |
| -------------------------------------------- | ---------- | ---------- | --------- |
| baseline                                     | 0,6592     | 1,0902     | 0,035     |
| Elo (K 20, vantaggio 60)                     | 0,6294     | 1,0486     | 0,047     |
| Poisson, L2 0,1 (primo valore)               | 0,6556     | 1,1216     | 0,090     |
| **Poisson, L2 3**                            | **0,6121** | **1,0238** | **0,027** |
| Dixon-Coles, L2 0,1, ξ 0,0019 (primo valore) | 0,6564     | 1,1301     | 0,088     |
| **Dixon-Coles, L2 3, ξ 0,005**               | **0,6133** | **1,0280** | **0,032** |

- Con L2 0,1 i modelli gol erano troppo sicuri di sé, con poche partite per squadra.
- Il risultato è stabile tra L2 2,5 e 5. Oltre 10 i modelli diventano troppo prudenti.
- Valori adottati: **L2 = 3** per Poisson e Dixon-Coles, **ξ = 0,005/giorno** per Dixon-Coles.
- Cambiare gli iperparametri crea versioni nuove, ciascuna con il proprio backtest.
- Ripetere la taratura quando lo storico cresce, per esempio a metà stagione, per non adattare i valori a un solo periodo.

**14/11/2026 ([ADR 0038](../decisions/0038-modello-gol-tempo-e-neopromosse.md)):** con lo storico di quattro stagioni, Poisson usa ξ = 0,0015 e Dixon-Coles ξ = 0,001, e le neopromosse partono da attacco −0,2 e difesa −0,1. Su un banco di prova con dati pubblici (3.483 partite di cinque campionati) il Log Loss 1X2 passa da 0,9928 a 0,9899 per Poisson e da 0,9960 a 0,9897 per Dixon-Coles. Le versioni nuove si confrontano da sole sul database (ADR 0023). Per confermare i valori: `tune` senza argomenti.

## Limiti noti

- Lo storico è solo la stagione in corso: all'inizio il campione è piccolo e il Confidence Score sarà spesso basso.
- Squadre senza partite nella competizione (per esempio all'inizio della Champions League) hanno forza media.
- Elo (K = 20, vantaggio casalingo 60) non è ancora tarato.
