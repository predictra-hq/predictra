# ADR 0033 — Bet Builder su tutti i mercati con quote italiane

**Stato:** Accettata (richiesta del proprietario del 12/11/2026: "il Bet Builder deve proporre tenendo conto di tutte le quote che ha a disposizione") · **Data:** 2026-11-12 · **Aggiorna:** ADR 0025, ADR 0027, ADR 0028

## Contesto

- Dopo gli ADR 0029 e 0032 il database ha quote reali per tre mercati:
  - **1X2**, da tutti i bookmaker, compresi Codere e Unibet Italia;
  - **under/over** per linee .5;
  - **doppia chance**, solo per le partite più vicine, quando il budget lo permette.
- Il motore delle previsioni calcola già tutti questi mercati, e anche gol/no gol, gol squadra, handicap e risultato esatto.
- Il Bet Builder usava solo l'1X2.

## Decisione

1. **Mercati delle proposte:** 1X2, doppia chance e under/over (linee .5), cioè i soli con quote reali di bookmaker italiani nella fonte gratuita. Il collegamento previsione → quota è `odds_market_for`, nel database e nel motore.
2. **Probabilità di mercato** (consenso senza margine di tutti i bookmaker FRESH):
   - 1X2 e under/over: de-margin proporzionale per bookmaker, poi media tra bookmaker;
   - doppia chance: dal consenso 1X2 quando c'è (più bookmaker), per esempio 1X = P(1) + P(X); altrimenti dalle quote di doppia chance normalizzate a somma 2.
3. **Regole invariate** (ADR 0028):
   - probabilità usata = media pesata modello/mercato;
   - quota solo da bookmaker italiani;
   - una selezione per partita e squadre tutte diverse (ADR 0026);
   - stesse soglie.
4. **Candidati:** il motore considera i 30 migliori per punteggio (`MAX_CANDIDATE_LEGS`), quindi il calcolo resta limitato anche con più mercati.
5. **App:**
   - etichette leggibili, per esempio "Doppia chance 1X" e "Totale gol Over 2,5";
   - in "Le più probabili", quota italiana anche per la doppia chance e quota reale combinata delle multiple quando tutte le selezioni ne hanno una;
   - il calcolatore Kelly usa la stessa probabilità prudente del Bet Builder.

## Conseguenze

- Più proposte possibili, tutte giocabili su un bookmaker italiano.
- Gol/no gol, gol squadra e risultato esatto restano senza quote italiane gratuite: compaiono solo tra le più probabili, con la quota equa del modello.
- Le schedine salvate con selezioni diverse dall'1X2 mostrano l'etichetta corretta. La loro rivalutazione con le quote attuali resta per ora solo 1X2.
- Test:
  - motore: `test_adr_0033_tutti_i_mercati_con_quote_italiane`;
  - database: proposte su under/over e doppia chance;
  - app: etichette e quote combinate.
