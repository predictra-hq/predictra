# ADR 0020 — Versioning e riproducibilità delle previsioni

**Stato:** Proposta (diventa Accettata con il merge della PR di M4 corsia 0) · **Data:** 2026-11-08

## Contesto

- Regola 4 di `CLAUDE.md`: ogni previsione è riproducibile e versionata.
- Il motore (M4 corsia A) gira in Python su GitHub Actions (ADR 0010): non c'è un processo sempre attivo né uno storage di artefatti a parte.
- Budget di GitHub Actions: circa 2.000 minuti al mese, di cui circa 1.400 già stimati (M0 §5). Le raccolte M2 e M3 ne usano già una parte.

## Decisione

### 1. Cosa identifica una versione di modello (`model_versions`)

| Campo                                          | Contenuto                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `model_key`                                    | famiglia: `baseline`, `elo`, `poisson`, `dixon_coles` (ADR 0021)                                 |
| `version`                                      | etichetta leggibile, unica per famiglia (es. `2026.11.08-1`)                                     |
| `code_commit`                                  | SHA git del codice del motore che ha addestrato il modello                                       |
| `parameters`                                   | iperparametri e parametri stimati (JSON): ricostruiscono il modello senza riaddestrarlo          |
| `training_window_start`, `training_window_end` | partite usate: `kickoff_at` in questo intervallo                                                 |
| `training_data_hash`                           | SHA-256 dell'elenco ordinato `(match_id, home_score, away_score)` delle partite di addestramento |
| `training_matches`                             | numero di partite                                                                                |

- Una versione è **immutabile**: dopo l'inserimento cambiano solo stato e attivazione.
- Stessi `code_commit`, `parameters` e dati (`training_data_hash`) devono produrre gli stessi numeri: i test del motore lo verificano.

### 2. Dove stanno gli artefatti

Nel database, non in file. I modelli della v1 sono piccoli: rating Elo per squadra, forze d'attacco e difesa, `rho`. `parameters` basta a ricostruirli. Se in futuro servissero artefatti grandi, si deciderà con un nuovo ADR.

### 3. Riproducibilità di una singola previsione

Ogni riga di `predictions` registra:

- la versione del modello e l'esecuzione (`prediction_runs`);
- `as_of`: l'istante dei dati usati. Il database rifiuta una previsione con `as_of` successivo al calcio d'inizio (anti-leakage);
- `features_hash`: SHA-256 delle feature in ingresso.

Le previsioni non si modificano né si cancellano: una nuova stima è una nuova riga con un `as_of` più recente.

### 4. Anti-leakage

- Il motore legge lo storico **solo** con la funzione `training_results(as_of)`, che restituisce le partite concluse con `kickoff_at < as_of`.
- Il backtest è **walk-forward**: per ogni giornata si addestra con i dati precedenti e si prevede la giornata.

### 5. Quando gira il motore

- **Previsioni:** dopo la raccolta football-data dell'alba e del pomeriggio, due volte al giorno, circa 3 minuti ciascuna: circa 180 minuti al mese.
- **Riaddestramento e backtest:** una volta alla settimana, circa 10 minuti: circa 40 minuti al mese.
- Totale stimato: circa 220 minuti al mese, da verificare con le prime esecuzioni reali. Se il budget non basta, si riducono le esecuzioni delle previsioni.

## Conseguenze

- Ogni numero mostrato si può ricondurre a versione, codice e dati.
- `predictions` cresce nel tempo: 8 competizioni × circa 10 partite a settimana × circa 60 righe per partita ≈ 5.000 righe a settimana. La conservazione si decide in M8 (ADR 0041).
