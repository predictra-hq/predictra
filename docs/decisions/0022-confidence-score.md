# ADR 0022 — Confidence Score

**Stato:** Accettata (PR #17; verificata con la chiusura di M4, 8/11/2026) · **Data:** 2026-11-08

## Contesto

Il Prompt Master chiede un Confidence Score per ogni previsione. Il piano M0 non lo definisce. Serve un indice spiegabile, tra 0 e 1, che dica **quanto fidarsi della stima**. Non è la probabilità dell'esito.

## Decisione

Per ogni previsione si calcola:

```text
C = 0,30·S_campione + 0,25·S_calibrazione + 0,25·S_accordo + 0,20·S_dati
```

Ogni componente è compresa tra 0 e 1:

| Componente       | Definizione                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S_campione`     | dimensione del campione: `min(1, n / 20)`, dove `n` è il numero minimo di partite concluse delle due squadre nella finestra di addestramento                                           |
| `S_calibrazione` | `max(0, 1 − ECE / 0,10)`, dove `ECE` è l'errore di calibrazione atteso della versione nell'ultimo backtest, sul mercato 1X2                                                            |
| `S_accordo`      | `1 − min(1, d / 0,20)`, dove `d` è la distanza media assoluta sull'1X2 tra il modello attivo e gli altri modelli valutati sulla stessa partita (se ce n'è uno solo, `S_accordo` = 0,5) |
| `S_dati`         | qualità dei dati della partita: 1 se partita e risultati recenti delle due squadre hanno qualità `OK` e la partita è `FRESH`; 0,5 con un avviso; 0 con un errore                       |

- Le soglie (20 partite, ECE 0,10, distanza 0,20) e i pesi sono **iniziali**. Si rivedono dopo i primi backtest reali con un nuovo ADR.
- Il valore e le quattro componenti si salvano nella previsione: `confidence_score`, più le componenti nel campo `explanation`. L'interfaccia mostra sempre anche le componenti.
- Fasce per l'interfaccia: **bassa** < 0,40 ≤ **media** < 0,70 ≤ **alta**.

## Conseguenze

- Con una sola stagione di storico, all'inizio `S_campione` e `S_calibrazione` saranno basse: il punteggio sarà spesso "basso", ed è corretto così.
- M5 usa il Confidence Score come soglia minima per proporre combinazioni.
