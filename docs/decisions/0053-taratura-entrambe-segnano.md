# ADR 0053 — Taratura delle probabilità di «entrambe segnano»

- **Stato:** accettato (16/11/2026)
- **Milestone:** M4 (prediction engine)

## Contesto

Le probabilità di «entrambe segnano» (BTTS) vengono dalla matrice dei risultati esatti. Sul banco di prova (3.483 partite dal 1/7/2024, cinque campionati) la matrice è **troppo sicura**: quando dà il Sì sotto il 40% esce nel 43,5% dei casi, quando lo dà tra il 60 e il 70% esce nel 59,5%. In media dà il Sì al 52,6% contro il 54,6% osservato.

## Decisione

La probabilità del Sì diventa `σ(0,6 · logit p + 0,05)`, dove `p` è quella della matrice; il No è il complemento. In pratica: stessa direzione, valori più vicini al 50%, leggermente spostati verso il Sì. Codice in `services/prediction-engine/src/predictra_engine/markets.py` (`calibrate_btts`).

## Verifica

Log Loss del mercato BTTS, più basso è meglio:

| Insieme                     | Matrice | Tarata |
| --------------------------- | ------- | ------ |
| 2024-25 (1.732 partite)     | 0,6870  | 0,6844 |
| 2025-26 (1.751 partite)     | 0,6897  | 0,6870 |
| Probabilità costante (rif.) | 0,6905  | —      |

- La pendenza stimata su una stagione e verificata sull'altra dà lo stesso risultato nei due versi (0,56 e 0,53): non è adattamento a una stagione.
- Il miglioramento c'è in tutti e cinque i campionati del banco, presi uno per uno.
- I due parametri sono arrotondati (0,6 e 0,05) e non cambiano tra 0,5 e 0,7 di pendenza.

## Conseguenze

- Le giocate «entrambe segnano» arrivano più di rado alle soglie alte delle Certezze: è l'effetto voluto, erano le più sopravvalutate.
- Solo BTTS cambia. 1X2, doppia chance e under/over restano quelli della matrice: le stesse prove su quei mercati non danno guadagni che si ripetono ([prediction-engine.md](../operations/prediction-engine.md)).
- `markets.py` fa parte del codice del modello: nasce una versione nuova, che diventa attiva da sola se nel backtest batte il riferimento (ADR 0023).
- Limite: il mercato resta difficile. Anche tarato, il modello batte di poco una probabilità costante.

## Aggiornamento del 16/11/2026: anche l'under/over 1,5

Lo stesso controllo, ripetuto linea per linea sui gol totali (stima su una stagione, verifica sull'altra, nei due versi), dà un guadagno che si ripete solo sulla linea 1,5:

| Linea | 2024-25 → 2025-26 | 2025-26 → 2024-25 | Esito                        |
| ----- | ----------------- | ----------------- | ---------------------------- |
| 1,5   | 0,5396 → 0,5375   | 0,5234 → 0,5215   | **adottata**                 |
| 2,5   | 0,6853 → 0,6829   | 0,6732 → 0,6734   | non adottata (un verso solo) |
| 3,5   | 0,5983 → 0,5979   | 0,6045 → 0,6058   | non adottata                 |

Per l'over 1,5 si usa `σ(0,7 · logit p + 0,4)`; l'under è il complemento. Il guadagno c'è in tutti e cinque i campionati e non cambia con pendenze tra 0,65 e 0,8. L'effetto più utile è nella fascia alta, quella delle Certezze: dove la matrice dava l'over 1,5 tra l'85 e il 90% (media 87,0%) è uscito nell'83,1% dei casi; tarata, la previsione media scende all'85,0%. L'over 1,5 tarato non scende mai sotto l'over 2,5 della matrice, così le linee restano coerenti.
