# ADR 0039 — Sfidante Dixon-Coles combinato con l'Elo

**Stato:** Proposta (richiesta del proprietario del 14/11/2026) · **Data:** 2026-11-14 · **Aggiorna:** ADR 0024

## Contesto

- In gara ci sono due modelli che calcolano tutti i mercati: Poisson e Dixon-Coles (ADR 0024). L'Elo resta interno: dà solo l'1X2 e serve come secondo parere per il Confidence Score.
- I due approcci leggono cose diverse: il modello gol i gol fatti e subiti, l'Elo solo i risultati con il loro ordine nel tempo. Sbagliano in modo diverso, quindi una media può essere più precisa di entrambi.
- Il database accetta solo i nomi `baseline`, `elo`, `poisson` e `dixon_coles` (vincolo su `model_versions.model_key`). Un nome nuovo richiederebbe una migrazione.

## Misura (banco di prova dell'ADR 0038: 3.483 partite dei cinque campionati principali, 2024–2026)

| Modello                         | Brier 1X2 | Log Loss 1X2 | ECE    | Log Loss Over 2,5 | Log Loss gol/no gol |
| ------------------------------- | --------- | ------------ | ------ | ----------------- | ------------------- |
| Elo da solo                     | —         | 0,9950       | —      | —                 | —                   |
| Dixon-Coles (ADR 0038)          | 0,5902    | 0,9897       | 0,0125 | 0,6793            | 0,6884              |
| Dixon-Coles + Elo, peso 0,2     | 0,5893    | 0,9883       | 0,0103 | —                 | —                   |
| Dixon-Coles + Elo, peso 0,3     | 0,5892    | 0,9881       | 0,0118 | —                 | —                   |
| **Dixon-Coles + Elo, peso 0,4** | 0,5893    | **0,9881**   | 0,0082 | 0,6789            | 0,6888              |
| Dixon-Coles + Elo, peso 0,5     | 0,5895    | 0,9885       | 0,0080 | —                 | —                   |
| Poisson + Elo, peso 0,3         | 0,5893    | 0,9883       | 0,0138 | —                 | —                   |

Il Poisson attuale in servizio ha 0,9928.

## Decisione

1. **Lo sfidante `dixon_coles` diventa Dixon-Coles + Elo** con peso 0,4 sull'1X2: `p = 0,6 · gol + 0,4 · Elo`. Il peso 0,4 ha lo stesso Log Loss di 0,3 e una calibrazione migliore. Stesso nome nel database, versione nuova: nessuna migrazione.
2. **Mercati coerenti:** la matrice dei risultati esatti del Dixon-Coles viene ricalibrata in modo che le zone vittoria casa, pareggio e vittoria ospite sommino all'1X2 combinato. Dentro ogni zona le proporzioni tra i punteggi restano quelle del modello gol. Tutti i mercati derivati (doppia chance, under/over, gol/no gol, handicap, risultato esatto) sono quindi coerenti con l'1X2 mostrato. Su under/over e gol/no gol l'effetto è trascurabile (tabella).
3. **Poisson resta solo modello gol**, con i valori dell'ADR 0038: due approcci diversi in gara.
4. **Scelta automatica (ADR 0023):** la versione nuova fa il backtest sul database e diventa attiva solo se batte la baseline e il modello attivo di almeno 0,001 di Log Loss.
5. **Interfaccia:** il nome resta "Dixon-Coles": dipende dalla chiave del modello e comparirebbe anche sulle versioni passate senza Elo. Gli iperparametri della versione (`elo_weight`) dicono se include l'Elo.

## Conseguenze

- Il Confidence Score usa ancora l'Elo come secondo parere. Con Dixon-Coles + Elo attivo l'accordo tra i due sarà un po' più alto per costruzione: da valutare con i dati reali.
- Il codice è in `services/prediction-engine/src/predictra_engine/models/blend.py`; test in `tests/test_models.py` (coerenza tra matrice e 1X2, proporzioni nelle zone, iperparametri).
