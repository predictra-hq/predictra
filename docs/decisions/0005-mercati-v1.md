# ADR 0005 — Mercati valutabili in v1

**Stato:** Accettata (approvata il 2026-11-07) · **Data:** 2026-11-07

## Contesto

Con le fonti gratuite (ADR 0004) per la stagione corrente sono disponibili soltanto i risultati e le quote 1X2.

## Decisione

- **Valutabili dal modello gol** (Poisson / Dixon-Coles su risultati storici): 1X2, Doppia chance, Draw No Bet, Over/Under gol, Goal/No Goal, gol squadra, risultato esatto, handicap europeo/asiatico (con push e mezze linee modellati correttamente).
- **EV e fair odds** solo dove esiste una quota reale e fresca. In v1 di fatto 1X2.
- **Non valutabili in v1:** corner, cartellini, tiri, marcatori, assist e mercati giocatore, primo/secondo tempo (finché non c'è storico affidabile). La UI li mostra come "non valutabile" con il motivo.
- **Live:** disattivato.

## Conseguenze

- La copertura si amplia solo con nuove fonti o piani a pagamento approvati, tramite una nuova ADR.
