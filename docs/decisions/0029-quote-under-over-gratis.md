# ADR 0029 — Quote under/over gratis con budget adattivo

**Stato:** Accettata (scelta del proprietario il 12/11/2026: "sempre gratis, ma con tante informazioni") · **Data:** 2026-11-12 · **Aggiorna:** ADR 0015 (quote v1)

## Contesto

- Il proprietario vuole quote dei bookmaker italiani anche per mercati diversi dall'1X2.
- Il budget è €0 (regola 7): piano gratuito di The Odds API, 500 crediti al mese.
- Il costo di `/odds` è di 1 credito per mercato e per regione, solo se ci sono eventi. I mercati di `/odds` sono `h2h`, `totals` e `spreads`. Gol/no gol, doppia chance e gli altri mercati si chiedono partita per partita (`/events/{id}/odds`), quindi costano molto di più e non entrano nel piano gratuito.
- Bookmaker italiani coperti: solo Codere e Unibet Italia (la regione `it` non esiste).
- Consumo misurato su DEV dal 7 al 12/11/2026:
  - 7–8 crediti al giorno, tutti della raccolta `daily`;
  - la raccolta `prematch` non ha mai speso crediti, perché non c'erano partite nelle 6 ore successive alle finestre;
  - crediti residui il 12/11: 451.

## Decisione

1. **Raccolta giornaliera:** chiede `h2h,totals` quando i crediti bastano fino a fine mese, altrimenti solo `h2h`.
   - Regola: `residui ≥ riserva (20) + giorni rimanenti nel mese × 2 × competizioni`.
   - I crediti residui si leggono prima con `/sports`, che è gratuito.
   - Senza il dato non si rischia: solo 1X2.
2. **Prima della partita (`prematch`):** solo 1X2, per le quote di chiusura (CLV).
3. **Catalogo:** una voce per linea (`totals_0_5` … `totals_5_5`, esiti `OVER` e `UNDER`), senza cambiare `odds_snapshots`. Le linee asiatiche (es. 2,25) si scartano.
4. **Collegamento con le previsioni:** `app_private.odds_market_for('TOTAL_GOALS', 2.5) = 'totals_2_5'`.
5. **App:** in "Le più probabili", accanto alla quota equa, la migliore quota reale di un bookmaker italiano per 1X2 e under/over.

Migrazione `20261112030000_odds_totals_markets.sql`.

## Conseguenze

- Circa 16 crediti al giorno nei giorni con partite: dentro i 500 al mese, con la riserva. Se i crediti scendono, l'under/over si ferma da solo e l'1X2 continua.
- Gol/no gol, doppia chance e gli altri mercati restano senza quote reali: solo la probabilità del modello e la quota equa. Averli richiederebbe un piano a pagamento.
- Il Bet Builder non propone ancora selezioni under/over: si aggiunge dopo l'ADR 0028 (consenso di mercato a 2 esiti per linea, quota solo italiana).
