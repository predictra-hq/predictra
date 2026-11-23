# ADR 0063 — Taratura anche della linea 3,5 dei gol

- **Stato:** accettato (23/11/2026)
- **Milestone:** M8 (corsia A, motore delle previsioni)

## Contesto

L'ADR 0060 aveva tarato le linee 1,5 e 2,5 e lasciato la 3,5, perché nella prova la taratura migliorava il Log Loss in un verso solo (recenti → vecchie: 0,6252 → 0,6196; vecchie → recenti: 0,6240 → 0,6240, invariato).

Due fatti nuovi:

- la verifica storica (ADR 0057) mostra le giocate dal 70% sull'under 3,5 uscite il **73,9%** contro il **78,2%** dato, su 4.288 giocate: uno scarto di oltre 4 punti, ben sopra il caso;
- nelle schedine consigliate del turno 20–23/11 l'under 3,5 compariva **5 volte**: il modello lo vedeva sottoquotato dai bookmaker (quote 1,61–1,67) e le schedine lo sceglievano per il «valore». Equilibrata e Lunga sono state perse proprio su un under 3,5 (Parma–Roma 1-5).

## Decisione

Over 3,5 tarato con `a = 0,65`, `b = −0,2` (stima su tutte le partite: 0,63 e −0,21). Un under 3,5 dato al 78% dalla matrice diventa 73,5%, la frequenza osservata. Nella prova il Log Loss non peggiora in nessun verso e migliora in uno.

## Conseguenze

- Versione nuova del modello (`markets.py`), con backtest e verifica storica nuovi al primo ciclo del motore.
- Meno under 3,5 con «valore» nelle schedine: il valore che il modello vedeva veniva dal suo eccesso di sicurezza.
