# ADR 0080 — Solo il periodo attuale, «Conti» al posto di «Bankroll», tendine e suggerimenti personalizzati

- **Stato:** accettato (27/11/2026)
- **Milestone:** M8 (corsie A e B)
- **Aggiorna:** ADR 0070 (schedine per turno o giornata), ADR 0064 (Spogliatoio in Home), ADR 0030 (bankroll)

## Contesto

Richieste del proprietario del 27/11/2026:

- non vedere schedine e proposte dei turni lontani, perché quote e previsioni cambiano prima che si giochino;
- nella card Spogliatoio in Home, sapere da quale chat viene ogni messaggio;
- nomi di chi ha reagito solo passando con il mouse;
- «Conti» al posto di «Bankroll»;
- tendine e suggerimenti con la grafica del sito, non quelli del browser.

## Decisione

1. **Solo il periodo attuale** (`currentWindowStart` e `inCurrentWindow` in `lib/bet-builder/bollette.ts`): schedine consigliate, proposte con valore, giocate più probabili e card in Home mostrano solo il turno in corso (venerdì–lunedì o martedì–giovedì) oppure, con la scheda Giornata, solo oggi nel fuso di Roma. Il salvataggio delle schedine per le Passate (`record.ts`) non cambia.
2. **Card Spogliatoio:** l'ultimo messaggio di ogni chat (Generale, Schedine, Partite), al massimo tre, dal più recente, con il nome della chat accanto all'autore.
3. **Suggerimenti personalizzati** (`components/ui/tooltip.tsx`, solo CSS): al passaggio del mouse e al focus da tastiera, al posto di `title`. Le reazioni dello Spogliatoio mostrano chi le ha messe solo così; la riga sempre visibile sotto il messaggio è tolta.
4. **«Conti»:** testi dell'interfaccia e indirizzo `/accounts`; `/bankroll` rimanda a `/accounts` (`next.config.ts`). Tabelle, tipi e funzioni restano `bankroll`: nessuna migrazione.
5. **Tendine personalizzate** (`components/ui/select.tsx`, riesportato da `primitives.tsx`): stesso uso di un `<select>`, con un `<select>` nativo nascosto per il valore del modulo e l'evento `change` (i filtri `FilterForm` restano uguali). Schema WAI-ARIA «select-only combobox», tastiera completa, apertura verso l'alto se sotto non c'è spazio.

## Conseguenze

- In alcuni momenti (per esempio il lunedì sera) la pagina Schedine è vuota: il turno successivo compare quando inizia.
- Sul telefono i nomi di chi ha reagito non si vedono, perché non c'è il passaggio del mouse: scelta del proprietario. Con la tastiera compaiono al focus.
- Un campo obbligatorio nascosto non mostra il messaggio del browser se vuoto; oggi tutte le tendine hanno un valore iniziale.
