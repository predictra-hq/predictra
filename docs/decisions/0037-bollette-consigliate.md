# ADR 0037 — Bollette consigliate

**Stato:** Proposta (richiesta del proprietario del 14/11/2026: "non basta mettere le giocate sicure con quotazione più bassa") · **Data:** 2026-11-14 · **Aggiorna:** ADR 0028, ADR 0033

## Contesto

- La sezione "Le più probabili" sceglie per ogni partita il pronostico con la probabilità più alta. Quasi sempre è una doppia chance o un over 1,5 a quota molto bassa: la multipla che ne esce paga poco.
- Le "Proposte con valore" (ADR 0025–0036) richiedono valore atteso positivo e Confidence Score: sono poche e spesso zero.
- Mancava una via di mezzo leggibile: una bolletta pronta, giocabile, con quote che valgono la giocata.

## Decisione

1. **Nuova sezione "Bollette consigliate"**, in cima alla pagina delle bollette. Per ogni turno (ADR 0036) al massimo una multipla per profilo:
   - **Solida:** ogni selezione con probabilità almeno 65% e quota almeno 1,25; fino a 3 selezioni;
   - **Equilibrata:** almeno 55% e quota almeno 1,45; fino a 4 selezioni;
   - **Alta quota:** almeno 42% e quota almeno 1,80; fino a 4 selezioni.
2. **Solo quote reali di bookmaker italiani** (ADR 0028): la quota totale è il prodotto delle quote reali. I mercati sono quindi 1X2, doppia chance e under/over (ADR 0033).
3. **Probabilità del modello attivo**, con Confidence Score almeno 0,40 e non oltre il 90%, come in "Le più probabili".
4. **Controllo di credibilità:** si scarta la selezione se `probabilità × quota − 1` è sotto −8% (quota cattiva) o sopra +20% (modello troppo distante dal bookmaker: l'ADR 0028 ha mostrato che in quei casi di solito sbaglia il modello).
5. **Scelta:** per ogni partita la selezione più probabile tra quelle che rispettano il profilo; tra le partite, le più probabili. Una selezione per partita, squadre tutte diverse (ADR 0026).
6. **Quote e freschezza:** si usa l'ultima quota letta e la bolletta mostra quando; oltre 12 ore compare l'avviso di ricontrollarla dal bookmaker. Le quote si raccolgono nelle 48 ore prima delle partite (ADR 0032), quindi le bollette compaiono a ridosso del turno.
7. **Nessuna bolletta forzata:** con meno di 2 selezioni valide il profilo non compare. Due profili con le stesse selezioni compaiono una volta sola.
8. **Dove gira:** calcolo in TypeScript a ogni visita (`apps/web/src/lib/bet-builder/bollette.ts`), dalle previsioni e dalle quote già nel database. Nessuna migrazione, nessuna scrittura: le bollette non sono versioni immutabili come le proposte del motore.

## Conseguenze

- La pagina mostra per prime bollette con quota totale e probabilità di vincita in evidenza, poi le proposte con valore, poi le più probabili.
- La probabilità mostrata è quella del modello, non la media prudente modello/mercato delle proposte: il controllo di credibilità limita l'errore, ma non lo elimina. Va detto in pagina, ed è detto.
- Le soglie dei profili sono iniziali e non verificate su dati reali: si rivedono dopo aver confrontato le bollette proposte con i risultati.
- Le bollette cambiano quando cambiano quote e previsioni: non c'è uno storico. Se servirà misurarne i risultati, andranno salvate dal motore con un nuovo ADR.
- Test: `apps/web/src/lib/bet-builder/bollette.test.ts`.
