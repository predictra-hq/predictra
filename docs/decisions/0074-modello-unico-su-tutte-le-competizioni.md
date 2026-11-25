# ADR 0074 — Modello gol unico su tutte le competizioni nel modello PREDICTRA

- **Stato:** accettato (25/11/2026)
- **Milestone:** M8 (corsia A, motore di previsione)
- **Aggiorna:** ADR 0039 (Dixon-Coles + Elo), ADR 0024 (un modello PREDICTRA)

## Contesto

Il proprietario chiede un modello sempre più preciso. Ogni competizione si adatta da sola (`Model.fit`). In Champions League una squadra conta quindi solo le poche partite europee e non le decine del suo campionato. Il runbook del motore lo indicava tra i limiti noti.

## Misura

Prova `cross` (runbook del motore): backtest walk-forward settimanale dal 1/7/2024, 3.499 partite che il modello non aveva visto. Si confronta il modello precedente con un modello gol in cui attacco e difesa di ogni squadra sono comuni a tutte le competizioni, e ogni competizione ha il suo livello di gol e il suo vantaggio casalingo. Le partite europee collegano i campionati tra loro.

| Log Loss 1X2, differenza dal modello precedente | Tutte            | 2024-25          | 2025-26          | Champions League |
| ----------------------------------------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| Media con peso del modello unico 0,3            | −0,0017 ± 0,0012 | −0,0023 ± 0,0014 | +0,0001 ± 0,0026 | −0,0100 ± 0,0084 |
| Media con peso 0,5                              | −0,0021 ± 0,0020 | −0,0031 ± 0,0023 | +0,0010 ± 0,0043 | −0,0135 ± 0,0137 |

(± 2 errori standard, calcolati partita per partita.) Con peso 0,3 il guadagno supera il caso in tutto e sul 2024-25, il 2025-26 resta uguale e in Champions League è il miglioramento più grande misurato finora. Con 0,5 il guadagno è nel rumore e il 2025-26 peggiora un poco.

## Decisione

1. **Modello PREDICTRA:** l'1X2 diventa `0,7 · (Dixon-Coles + Elo) + 0,3 · modello unico` (`JointEloBlendModel`, `models/joint.py`). Gli altri mercati vengono ancora dalla matrice di Dixon-Coles, riportata all'1X2 combinato come già avviene con l'Elo: tutti i mercati restano coerenti.
2. **Stesso nome, versione nuova** (`dixon_coles`, iperparametri con `joint`): nessuna migrazione. La versione nuova fa il suo backtest sul database e si attiva secondo l'ADR 0023.
3. **Riproducibilità (ADR 0020):** con la versione si salvano gli iperparametri del modello unico e, per ogni competizione, il suo livello e le forze delle sue squadre. La taratura automatica (ADR 0056) ricostruisce e varia il modello senza perdere il modello unico.
4. **La prova resta disponibile** (comando `cross`) per ripeterla quando la stagione 2025-26 avrà più partite.

## Conseguenze

- Previsioni più precise soprattutto in Champions League. In media il guadagno è piccolo (circa 0,002 di Log Loss): con i soli risultati delle partite il modello resta vicino al suo limite.
- Nessuna garanzia di vincere: il modello migliora le probabilità, non rende certo l'esito.
