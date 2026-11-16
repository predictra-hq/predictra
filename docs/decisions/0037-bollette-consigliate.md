# ADR 0037 — Schedine consigliate

**Stato:** Proposta (richiesta del proprietario del 14/11/2026: "non basta mettere le giocate sicure con quotazione più bassa") · **Data:** 2026-11-14 · **Aggiorna:** ADR 0028, ADR 0033

## Contesto

- La sezione "Le più probabili" sceglie per ogni partita il pronostico con la probabilità più alta. Quasi sempre è una doppia chance o un over 1,5 a quota molto bassa: la multipla che ne esce paga poco.
- Le "Proposte con valore" (ADR 0025–0036) richiedono valore atteso positivo e Confidence Score: sono poche e spesso zero.
- Mancava una via di mezzo leggibile: una schedina pronta, giocabile, con quote che valgono la giocata.

## Decisione

1. **Nuova sezione "Schedine consigliate"**, in cima alla pagina delle schedine. Per ogni turno (ADR 0036) al massimo una multipla per profilo:
   - **Solida:** ogni selezione con probabilità almeno 65% e quota almeno 1,25; fino a 3 selezioni;
   - **Equilibrata:** almeno 55% e quota almeno 1,45; fino a 4 selezioni;
   - **Alta quota:** almeno 42% e quota almeno 1,80; fino a 4 selezioni.
2. **Solo quote reali di bookmaker italiani** (ADR 0028): la quota totale è il prodotto delle quote reali. I mercati sono quindi 1X2, doppia chance e under/over (ADR 0033).
3. **Probabilità del modello attivo**, con Confidence Score almeno 0,40 e non oltre il 90%, come in "Le più probabili".
4. **Controllo di credibilità:** si scarta la selezione se `probabilità × quota − 1` è sotto −8% (quota cattiva) o sopra +20% (modello troppo distante dal bookmaker: l'ADR 0028 ha mostrato che in quei casi di solito sbaglia il modello).
5. **Scelta:** per ogni partita, tra le selezioni che rispettano probabilità e quota minime del profilo, quella con il **valore** più alto (probabilità × quota − 1); tra le partite, prima quelle con più valore (aggiornamento del 14/11/2026, sotto). Una selezione per partita, squadre tutte diverse (ADR 0026).
6. **Quote e freschezza:** si usa l'ultima quota letta e la schedina mostra quando; oltre 12 ore compare l'avviso di ricontrollarla dal bookmaker. Le quote si raccolgono nelle 48 ore prima delle partite (ADR 0032), quindi le schedine compaiono a ridosso del turno.
7. **Nessuna schedina forzata:** con meno di 2 selezioni valide il profilo non compare. Due profili con le stesse selezioni compaiono una volta sola.
8. **Dove gira:** calcolo in TypeScript a ogni visita (`apps/web/src/lib/bet-builder/bollette.ts`), dalle previsioni e dalle quote già nel database. Nessuna migrazione, nessuna scrittura: le schedine non sono versioni immutabili come le proposte del motore.

## Conseguenze

- La pagina mostra per prime schedine con quota totale e probabilità di vincita in evidenza, poi le proposte con valore, poi le più probabili.
- Dal 14/11/2026 la probabilità è quella prudente modello/mercato (aggiornamento sotto).
- Le soglie dei profili sono iniziali e non verificate su dati reali: si rivedono dopo aver confrontato le schedine proposte con i risultati.
- Le schedine cambiano quando cambiano quote e previsioni: non c'è uno storico. Se servirà misurarne i risultati, andranno salvate dal motore con un nuovo ADR.
- Test: `apps/web/src/lib/bet-builder/bollette.test.ts`.

## Aggiornamento del 14/11/2026: probabilità prudente e scelta per valore

Richiesta del proprietario: "quote sicure ma con alto margine, non solo quelle basse".

- **Probabilità prudente** come nelle proposte con valore (ADR 0028): media tra la probabilità del modello e quella del mercato senza margine, calcolata dalle quote di tutti i bookmaker (anche esteri) per 1X2, doppia chance (dal consenso 1X2 quando c'è) e under/over. Senza quote di mercato resta quella del modello. Motivo: su under/over e gol/no gol il modello da solo è appena sopra la media del campionato (ADR 0038).
- **Valore** = probabilità prudente × quota italiana − 1. Ammesso tra −3% (quota appena sotto il giusto) e +15% (oltre, modello e mercato troppo distanti per essere credibili). Prima l'intervallo era −8% / +20% sulla sola probabilità del modello.
- **Scelta per valore:** per ogni partita, tra le giocate "sicure" per il profilo, quella che paga di più rispetto al rischio, invece della più probabile.
- In pagina compaiono il valore di ogni selezione e il valore atteso della schedina.
- **Correzione:** Supabase restituisce al massimo 1.000 righe per richiesta, e le previsioni dei 10 giorni sono circa 35 righe a partita. Prima "Le più probabili" e le schedine vedevano solo una parte delle partite (28 su 57 su DEV il 14/11/2026). Ora le letture sono a pagine (`selectAll` in `queries.ts`), anche per le quote del costruttore manuale.
- Test: `apps/web/src/lib/bet-builder/bollette.test.ts`.

## Aggiornamento del 16/11/2026: più schedine e puntata modificabile

Richiesta del proprietario: più multiple e la possibilità di cambiare la puntata.

- Due profili in più per turno: **Doppia sicura** (2 selezioni, probabilità ≥ 72%, quota ≥ 1,20) e **Lunga** (fino a 6 selezioni, probabilità ≥ 55%, quota ≥ 1,30). Restano le stesse regole di valore e di quote reali italiane.
- Ogni schedina ha una puntata modificabile (euro interi): parte da quella consigliata (euro interi, minimo 2 €, ADR 0031) o da 10 € senza bankroll, ricalcola la vincita e "L'ho giocata" apre le Giocate fatte con l'importo scelto.

## Aggiornamento del 16/11/2026: nessuna schedina che in media fa perdere

Ogni selezione poteva avere un valore fino a −3%: una schedina «sicura» fatta di selezioni appena sotto il giusto usciva con valore complessivo negativo, e la pagina stessa diceva «meglio non giocarla». Ora il valore dell'intera schedina non scende sotto zero (`MIN_SLIP_VALUE`): si parte dalle selezioni più convenienti e una selezione che porterebbe il totale sotto zero non entra. Se non restano almeno due selezioni, quel profilo non viene proposto. Conseguenza: nei turni con quote basse possono uscire meno schedine.
