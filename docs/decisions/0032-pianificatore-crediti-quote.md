# ADR 0032 — Pianificatore dei crediti delle quote e doppia chance

**Stato:** Accettata (richiesta del proprietario del 12/11/2026: "sempre gratis, ma con tutte le quote possibili, limitando le richieste che non servono") · **Data:** 2026-11-12 · **Aggiorna:** ADR 0015, ADR 0029

## Contesto

- Budget €0: piano gratuito di The Odds API, 500 crediti al mese, 448 residui il 12/11/2026.
- Costi:
  - `/odds` costa 1 credito per mercato, per competizione, se ci sono eventi;
  - `/events/{id}/odds` costa 1 credito per mercato, **per partita**;
  - `/sports` e `/events` sono gratuiti.
- Verifica reale del 12/11/2026 su Como–Cagliari (3 crediti):

  | Mercato       | Bookmaker                                                | Italiani |
  | ------------- | -------------------------------------------------------- | -------- |
  | doppia chance | Pinnacle, 1xBet, Marathon, William Hill, **Codere (IT)** | Codere   |
  | gol/no gol    | 1xBet, William Hill                                      | nessuno  |
  | draw no bet   | William Hill                                             | nessuno  |

- Prima di questa decisione la raccolta giornaliera spendeva crediti anche sulle competizioni senza partite vicine, per esempio nelle pause per le nazionali.

## Decisione

1. **Budget del giorno:** `(crediti residui − riserva 20) / giorni rimanenti nel mese`, letto con `/sports`, che è gratuito.
2. **Solo dove serve:** il calendario si legge con `/events`, gratuito. Le competizioni senza partite nelle 48 ore successive non spendono crediti.
3. **Priorità**, finché c'è budget:
   1. **1X2** delle competizioni con partite vicine, sempre;
   2. **under/over** nella stessa chiamata, se il budget basta per tutte;
   3. **doppia chance** per le partite delle 36 ore successive, dalla più vicina, con i crediti rimasti. Vengono chieste una per una e unite all'evento prima della scrittura.
4. **Prima della partita (`prematch`):** invariata, solo 1X2 per le quote di chiusura.
5. **Gol/no gol e draw no bet non si raccolgono:** nessun bookmaker italiano li offre in questa fonte, e spendere crediti solo per il consenso non vale.
6. **Contratto:**
   - catalogo `double_chance` (`HOME_DRAW`, `HOME_AWAY`, `DRAW_AWAY`);
   - `odds_market_for('DOUBLE_CHANCE', null) = 'double_chance'`;
   - migrazione `20261112040000_odds_double_chance.sql`.

## Conseguenze

- Il consumo segue il calendario e non supera mai il budget del giorno. Se i crediti scendono si rinuncia prima alla doppia chance, poi all'under/over; l'1X2 resta finché i crediti sono sopra la riserva.
- Nelle giornate piene la doppia chance copre solo le partite più vicine: è il limite del gratuito.
- Il Bet Builder potrà usare 1X2, under/over e doppia chance con quote italiane reali (PR successiva).
