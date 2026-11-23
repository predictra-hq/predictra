# ADR 0062 — Sezioni a tre viste e schedine passate

- **Stato:** accettato (23/11/2026, richiesta del proprietario)
- **Milestone:** M8 (corsia B)

## Contesto

Il proprietario chiede viste semplici, con pochi elementi, e di poter rivedere le schedine consigliate dopo le partite: oggi spariscono perché si calcolano solo sulle partite in arrivo e non vengono salvate.

## Decisione

1. **Tre viste per sezione:**
   - Pronostici: Certezze, Schedine, Affidabilità;
   - Calcio: Partite, Campionati, Squadre;
   - Soldi: Bankroll, Giocate fatte e la nuova **Andamento** (`/performance`): profitto, resa, grafico e «Come sto andando», spostati da Giocate fatte, che resta l'elenco e la registrazione delle giocate.
2. **Schedine in tre schede:** Proposte, **Passate** (`/bet-builder/past`), Costruisci. Le schedine salvate si aprono da Costruisci; le statistiche delle proposte con valore da Passate.
3. **Schedine passate ricostruite:** per i turni già iniziati si rifanno le schedine consigliate con le stesse regole delle Proposte (`buildBollette`), usando per le partite finite l'ultima previsione e le quote raccolte prima del calcio d'inizio, e per quelle ancora da giocare i dati di adesso. Ogni selezione mostra risultato e uscita. Nessun dato nuovo nel database.
4. **Certezze senza multiple:** solo le giocate singole per campionato e l'affidabilità; le multiple stanno solo in Schedine.
5. **Home essenziale:** saluto, avvisi quando servono, tre riquadri (Certezze, Schedine, Bankroll) e le partite delle squadre seguite. Niente grafici né calendario: sono nelle loro sezioni.

## Limite dichiarato

Le schedine passate sono ricostruite, non fotografate: chi le ha guardate a metà turno può averne viste versioni diverse (le previsioni si aggiornano due volte al giorno e le partite iniziate escono dalle proposte). Se servirà la copia esatta, si potrà salvare una fotografia a ogni aggiornamento.
