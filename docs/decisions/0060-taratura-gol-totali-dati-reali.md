# ADR 0060 — Taratura dei gol totali sui dati reali

- **Stato:** accettato (17/11/2026)
- **Milestone:** M8 (corsia A, motore delle previsioni)

## Contesto

La verifica storica su tutti i mercati (ADR 0057) ha mostrato, su 8.616 partite reali rigiocate, che le giocate dal 70% su più/meno 2,5 gol escono il **66,8%** delle volte contro il 74,7% con cui erano date (868 giocate), e su 3,5 il 73,9% contro il 78,2% (4.288). La matrice dei risultati è troppo sicura sui gol totali.

## Prova (comando `totals`, sola lettura)

Walk-forward su tutte le partite, probabilità dell'over della matrice, taratura σ(a·logit p + b) stimata sulle stagioni vecchie e verificata sulle recenti, e viceversa:

| Linea | vecchie → recenti | recenti → vecchie | Esito                         |
| ----- | ----------------- | ----------------- | ----------------------------- |
| 1,5   | 0,5171 → 0,5143   | 0,5320 → 0,5261   | migliora nei due versi        |
| 2,5   | 0,6745 → 0,6730   | 0,6879 → 0,6810   | migliora nei due versi        |
| 3,5   | 0,6240 → 0,6240   | 0,6252 → 0,6196   | migliora in un verso solo: no |

## Decisione

1. Over 2,5 tarato con `a = 0,6`, `b = 0,15` (stime 0,53–0,74 e 0,12–0,14, arrotondate).
2. Over 1,5: taratura aggiornata a `a = 0,6`, `b = 0,55` (prima 0,7 e 0,4 dal banco di prova pubblico dell'ADR 0053; stime sui dati reali 0,55–0,66 e 0,49–0,61).
3. Linee coerenti: salendo di linea l'over non cresce mai; le linee intere (1, 2, 3) si ricavano dalle linee x,5 vicine (vince sopra, rimborso sulla linea, perde sotto).
4. Linea 3,5 e le altre: restano quelle della matrice.

## Conseguenze

- `markets.py` cambia: nasce una versione nuova del modello, con backtest e verifica storica nuovi; l'1X2 non cambia.
- Le giocate su più/meno 2,5 arrivano più di rado alle soglie alte di Certezze e Schedine: erano le più sopravvalutate.
- La verifica storica della settimana dopo dirà se lo scarto si è chiuso; il comando `totals` resta per ripetere la prova.
