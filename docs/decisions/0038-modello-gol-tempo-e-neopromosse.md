# ADR 0038 — Modello gol: peso del tempo e neopromosse più deboli

**Stato:** Proposta (richiesta del proprietario del 14/11/2026: "lavora tantissimo sul modello predittivo") · **Data:** 2026-11-14 · **Aggiorna:** ADR 0021, ADR 0024

## Contesto

- Dal 12/11/2026 lo storico contiene quattro stagioni (2022–2026, 6.443 partite di addestramento, ADR 0034). Il modello attivo, Poisson, pesava una partita del 2022 come una della settimana scorsa (ξ = 0). Dixon-Coles usava ξ = 0,005 al giorno, scelto quando lo storico era una sola stagione.
- Una squadra senza partite nella competizione partiva da forza media: per le neopromosse è troppo ottimista.
- Il backtest si fa sul database, che richiede la chiave segreta. Per confrontare le varianti prima di cambiare il codice ho usato un banco di prova locale con gli stessi modelli e lo stesso backtest walk-forward settimanale, su dati pubblici di **openfootball** (`football.json`, pubblico dominio).
  - Dati: Premier League, Serie A, LaLiga, Bundesliga e Ligue 1, stagioni 2021-22–2025-26 (8.887 partite).
  - Valutazione: le 3.483 partite dal 1/7/2024.
  - I dati servono solo all'esperimento: **non entrano nel prodotto** né nel database.
  - Il banco riproduce bene il database: Poisson attuale 0,9928 di Log Loss contro 0,9907 su DEV; baseline 1,0750 contro 1,0741.

## Risultati (banco di prova, 3.483 partite)

| Modello                                           | Brier 1X2 | Log Loss 1X2 | Log Loss Over 2,5 | Log Loss gol/no gol |
| ------------------------------------------------- | --------- | ------------ | ----------------- | ------------------- |
| baseline                                          | 0,6507    | 1,0750       | —                 | —                   |
| Poisson attuale (ξ 0)                             | 0,5923    | 0,9928       | 0,6795            | 0,6892              |
| Dixon-Coles attuale (ξ 0,005)                     | 0,5942    | 0,9960       | 0,6847            | 0,6899              |
| Poisson, ξ 0,0015                                 | 0,5904    | 0,9904       | —                 | —                   |
| Dixon-Coles, ξ 0,001                              | 0,5904    | 0,9901       | —                 | —                   |
| **Poisson, ξ 0,0015, neopromosse −0,2 / −0,1**    | 0,5902    | **0,9899**   | 0,6797            | 0,6887              |
| **Dixon-Coles, ξ 0,001, neopromosse −0,2 / −0,1** | 0,5902    | **0,9897**   | **0,6793**        | **0,6884**          |

Riferimento per l'Over 2,5: frequenza 53,3%, Log Loss 0,6910. Provati anche ξ 0,0005–0,003, L2 1 e 5, prior delle neopromosse da −0,1 a −0,3: i valori scelti sono i migliori o equivalenti ai migliori.

## Decisione

1. **Peso del tempo per entrambi i modelli:** Poisson ξ = 0,0015 al giorno (emivita circa 15 mesi), Dixon-Coles ξ = 0,001 (circa 23 mesi).
2. **Neopromosse:** una squadra che gioca nella competizione negli ultimi 300 giorni ma non nell'anno precedente parte da attacco −0,2 e difesa −0,1 (scala logaritmica: circa 18% di gol fatti in meno e 10% di gol subiti in più rispetto alla media) invece che da zero. Con le partite giocate il dato reale prevale. Se la competizione non ha partite nell'anno precedente (storico troppo corto) nessuna squadra è considerata neopromossa.
3. **Nuove versioni, scelta automatica.** Cambiano gli iperparametri, quindi nascono due versioni nuove con il proprio backtest sul database. L'attivazione automatica (ADR 0023) le adotta solo se battono la baseline, e tiene il modello attivo più forte di almeno 0,001 di Log Loss. Se sul database non migliorano, nulla cambia per gli utenti.
4. **Taratura:** il comando `tune` prova ora anche Poisson con il peso del tempo e i due modelli predefiniti, per confermare i valori sul database.

## Conseguenze

- Guadagno atteso modesto ma reale: circa 0,003 di Log Loss sull'1X2. È il limite dei modelli che usano solo i gol.
- **Limite dichiarato:** su Under/Over e gol/no gol i modelli sono appena sopra la frequenza media del campionato. Una probabilità alta su questi mercati riflette soprattutto la media della lega, non una lettura della partita. Per questo le schedine consigliate usano la probabilità prudente modello/mercato (ADR 0037, aggiornato il 14/11/2026).
- Passi successivi possibili, ciascuno da misurare allo stesso modo:
  - statistiche di partita (tiri, formazioni) come ingressi, quando API-Football avrà coperto lo storico;
  - quote di chiusura come riferimento, quando ce ne saranno abbastanza.
- Test: `services/prediction-engine/tests/test_models.py` (neopromosse riconosciute, partenza più debole, iperparametri registrati).
