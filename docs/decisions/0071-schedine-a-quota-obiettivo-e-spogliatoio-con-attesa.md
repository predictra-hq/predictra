# ADR 0071 — Schedine a quota obiettivo, peso del mercato, Spogliatoio con attesa, notifiche eliminabili

- **Stato:** accettato (25/11/2026); profili delle schedine aggiornati dall'ADR 0072
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)
- **Aggiorna:** ADR 0070 (profili delle schedine, reazioni), ADR 0064 (Spogliatoio), ADR 0035 (soglie dell'agente)

## Contesto

- Il proprietario trova le schedine consigliate troppo basse di quota («che senso ha giocare 10 euro per vincerne 18»). Le schedine continuano a perdere. Vuole almeno tre schedine per giornata o turno, una per tipo.
- Si chiedono anche Europa League e Conference League.
- Nello Spogliatoio si potevano scrivere molti messaggi di seguito.
- Le quote risultavano spesso «Non aggiornate», anche se si raccolgono ogni giorno.
- In Home arrivavano notifiche «agente degradato» senza un vero problema, e non si potevano eliminare.

## Analisi sui dati veri

Il 25/11/2026, sull'analisi del workflow «Verifica DEV» (opzione `slip-analysis`), su 408 giocate già decise con le quote di tutti i bookmaker senza margine. Brier per peso del mercato nella probabilità (più basso è meglio):

| Peso del mercato | Brier  |
| ---------------- | ------ |
| 0 (solo modello) | 0,2178 |
| 0,5 (prima)      | 0,2126 |
| 0,75             | 0,2110 |
| 1 (solo mercato) | 0,2100 |

Le quote del mercato indovinano meglio del modello da solo. Il modello resta tarato bene sulle giocate più probabili (doppia chance data al 70–80%: uscita il 76%; all'80–90%: l'87%).

## Decisione

1. **Probabilità delle schedine:** media pesata con peso del mercato **0,75** (`MARKET_WEIGHT` in `lib/bet-builder/bollette.ts`). Il modello conta ancora per un quarto: con 1 si consiglierebbe solo il margine del bookmaker. Le probabilità del modello in sé non cambiano (regola 5 del Prompt Master: le probabilità restano quantitative).
2. **Tre profili, ognuno con una quota totale obiettivo:**

   | Profilo     | Giocate dal | Quota minima | Partite (max) | Quota obiettivo | Scelta                     |
   | ----------- | ----------- | ------------ | ------------- | --------------- | -------------------------- |
   | Solida      | 68%         | 1,25         | 4             | 2               | più probabili (fino a −5%) |
   | Equilibrata | 55%         | 1,45         | 4             | 3,5             | valore (almeno zero)       |
   | Alta quota  | 40%         | 1,80         | 4             | 7               | valore (almeno zero)       |
   - Si aggiungono partite finché la quota totale arriva all'obiettivo, poi ci si ferma: meno partite vuol dire più probabilità di vincere.
   - Se l'obiettivo non si raggiunge, si allargano le soglie fino a tre volte (ogni volta −5 punti di probabilità e −0,1 di quota minima). Se nemmeno così si arriva all'obiettivo, resta la schedina con le soglie del profilo.
   - Il valore dell'intera schedina non scende sotto −8%.
   - «Doppia» non si costruisce più. Le schedine «Doppia» già salvate restano nelle Passate con l'etichetta «Doppia (regola precedente)».
   - Non si inventano schedine: con poche partite o quote se ne propongono meno di tre. Nessuna regola rende una multipla «sicura».

3. **Quote aggiornate fino a 26 ore** (`source_freshness_rules` di `the-odds-api` e `ODDS_MAX_AGE_MS`). Le quote si raccolgono una volta al giorno al mattino (più un giro prima delle partite della sera): con 12 ore risultavano «Non aggiornate» ogni sera.
4. **Soglie dell'agente:** il ciclo Python su GitHub Actions parte da QStash tre volte al giorno, con buchi fino a 9 ore. In `v_agent_status` la cadenza attesa diventa 480 minuti e il degrado scatta dopo 660 (prima 360): niente più falsi allarmi. QStash resta 15/45 minuti.
5. **Notifiche eliminabili:** ognuno elimina le proprie (policy `notifications_owner_delete`), una alla volta o tutte le già lette, dalla card in Home. Le notifiche dell'agente arrivano solo a chi ha `agents.monitor` (gli admin).
6. **Spogliatoio:**
   - un messaggio alla volta: dopo un messaggio si aspettano 2 minuti (errore `POST_COOLDOWN` dal trigger `check_community_posts_rate`, messaggio «Un messaggio alla volta»). Resta il limite di 10 messaggi in 5 minuti;
   - passando sopra una reazione si vede chi l'ha messa: `community_feed` restituisce anche i nomi visibili (`names`), mai email o id;
   - la tavolozza delle emoji si apre verso l'interno della chat (a destra per i propri messaggi), su due righe, e non sposta più la chat.
7. **Europa League e Conference League non si aggiungono.** Non sono nel piano gratuito di football-data.org (12 competizioni). Il piano gratuito di API-Football copre solo le stagioni 2022–2024, quindi niente stagione in corso. Un piano a pagamento richiede l'approvazione del proprietario (regola 7).

## Conseguenze

- Le schedine hanno quote più alte e quindi si vincono meno spesso: la Solida intorno a quota 2, l'Equilibrata intorno a 3,5, l'Alta quota intorno a 7.
- L'analisi va rifatta con più settimane di quote salvate. Peso del mercato e quote obiettivo restano da rivedere sui risultati.
- Chi scrive nello Spogliatoio aspetta 2 minuti tra un messaggio e l'altro, anche nella chat Schedine.
