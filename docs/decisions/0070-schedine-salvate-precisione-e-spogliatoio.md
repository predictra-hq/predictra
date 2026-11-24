# ADR 0070 — Schedine salvate, profili di precisione, giornata o turno, Spogliatoio con esiti e reazioni

- **Stato:** accettato (24/11/2026)
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)
- **Aggiorna:** ADR 0062 (schedine passate), ADR 0065 (profili delle schedine), ADR 0064 (Spogliatoio)

## Contesto

- Le schedine consigliate si calcolavano solo al momento: finite le partite non si ritrovavano più quelle proposte davvero. Le Passate le ricostruivano con le regole del giorno.
- Il proprietario vedeva molte schedine perse e voleva capire se il modello sbaglia.
- Si chiedevano schedine anche per la singola giornata, e non solo per il turno.
- Nello Spogliatoio le schedine condivise non mostravano come erano andate, la chat Schedine accettava testo libero e non c'erano reazioni.

## Analisi sui dati veri

L'analisi gira dal workflow «Verifica DEV», opzione `slip-analysis` (`apps/web/scripts/analysis/slips.analysis.ts`). Usa i dati di DEV, che sono la copia di PROD, e stampa solo numeri aggregati. Primo esito, il 24/11/2026:

- **Il modello è tarato bene.** Sulle partite delle ultime settimane:
  - doppia chance data al 70–80%: uscita il 76%;
  - doppia chance data all'80–90%: uscita l'87%;
  - over 1,5 dato al 70–80%: uscito il 75%.

  Il modello non è quindi la causa delle sconfitte.

- **Le sconfitte vengono dalle multiple.** Tre giocate al 66% vincono insieme il 29% delle volte. Una schedina a tre partite «normali» si perde più spesso di quanto si vinca, anche con un modello preciso.
- **Le proposte con valore** degli ultimi 30 giorni hanno vinto meno della metà delle volte, ma nell'insieme hanno reso, perché le quote alte compensano. Fanno eccezione le singole prudenti: 21 vinte su 43, ritorno −15%.
- **Le schedine consigliate ricostruibili** con le quote di prima delle partite sono ancora poche: le quote si raccolgono solo da metà novembre, e non bastano per scegliere le regole sui risultati.

## Decisione

1. **Profili di precisione.** «Doppia sicura» e «Solida» scelgono le giocate più probabili e accettano un valore leggermente negativo, fino a −5%:

   | Profilo     | Giocate dal | Partite | Scelta               |
   | ----------- | ----------- | ------- | -------------------- |
   | Doppia      | 80%         | 2       | più probabili        |
   | Solida      | 75%         | 3       | più probabili        |
   | Equilibrata | 60%         | 3       | valore (almeno zero) |
   | Alta quota  | 45%         | 3       | valore (almeno zero) |

   Si vince più spesso, con quote più basse. Nessuna regola rende le schedine «sicure»: la pagina continua a dirlo.

2. **Giornata o turno.** Proposte e Passate hanno due schede: Turno e Giornata (`?w=day`).
3. **Schedine salvate** in `recommended_slips`:
   - le scrive l'avvio programmato dell'agente (`/api/jobs/cycle`, firma QStash verificata) a ogni giro, per turno e per giornata, solo con partite ancora da giocare;
   - la prima volta salva anche quelle dei giorni passati ricostruite (`source = 'rebuilt'`);
   - le Passate leggono da qui: per periodo e profilo l'ultima versione proposta, e quelle salvate davvero hanno la precedenza su quelle ricostruite;
   - la tabella si legge da tutti gli utenti attivi e si scrive solo con la chiave di servizio. È copiata da PROD a DEV.
4. **Letture senza utente:** `withServiceClient` fa usare alle stesse funzioni delle pagine un client di servizio, solo nei tratti senza utente (salvataggio e analisi).
5. **Spogliatoio:**
   - le schedine condivise portano la chiave di ogni giocata: in chat compaiono l'esito di ogni partita, Vinta o Persa, e la data dell'aggiornamento;
   - nella chat Schedine si possono pubblicare solo schedine (vincolo `community_posts_slips_only`, valido per i nuovi messaggi);
   - le reazioni usano un elenco chiuso di emoji (`community_reactions`), sono visibili a tutti e ognuno toglie solo le proprie;
   - dalla Home ogni messaggio porta a sé stesso nella sua chat.
6. **Giocate fatte:** sotto una multipla registrata si apre la schedina, con partite, esiti scelti, risultati ed esito di ciascuna.
7. **Login:** dal lavoro di Alfredo (branch `feature/m8-b-accesso-presentazione`) solo le funzioni: «Mostra / Nascondi» password, recupero accanto al campo, «Torna alla presentazione». Lo sfondo della presentazione arriva dal branch `feature/m8-b-sfondo-presentazione`.

## Conseguenze

- Le Passate mostrano le schedine proposte davvero dal 24/11/2026. Quelle precedenti sono ricostruite e lo dice l'etichetta «Ricostruita».
- L'analisi va rifatta quando ci saranno più settimane di quote. Le regole dei profili restano da rivedere sui risultati.
