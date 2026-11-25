# ADR 0073 — Peso del mercato 0,75 nelle proposte con valore e verifica onesta dei risultati

- **Stato:** accettato (25/11/2026)
- **Milestone:** M8 (corsie 0 e A)
- **Aggiorna:** ADR 0028 (peso del mercato), ADR 0072 (analisi delle proposte)

## Contesto

Il proprietario chiede proposte che rendano sempre e un modello che «non perda quasi mai». Chiede anche se, puntando 10 € su ogni proposta aggressiva, avrebbe il ritorno del +73% indicato nell'ADR 0072.

## Correzione dell'ADR 0072

Il +73% era sbagliato. Il motore gira più volte al giorno e salva di nuovo la stessa proposta: l'analisi contava anche le copie. Contando ogni schedina una volta sola, al 25/11/2026 le proposte con valore già decise sono **114 distinte** (221 salvate), tutte dal 20/11/2026. Sono costruite con sole **37 giocate diverse**.

| Proposte (distinte)     | Vinte  | Ritorno | Intervallo al 95% |
| ----------------------- | ------ | ------- | ----------------- |
| Aggressive a 3 partite  | 4/26   | +5%     | da −92% a +102%   |
| Equilibrate a 2 partite | 11/33  | +27%    | da −36% a +91%    |
| Singole prudenti        | 8/16   | −10%    | da −57% a +36%    |
| Tutte                   | 31/114 | +32%    | da −18% a +82%    |

Le 37 giocate prese da sole (singole da 1 €) hanno perso l'11% (13 vinte su 33). Il ritorno positivo delle multiple viene da poche vincite ad alta quota. Con questi numeri non si può dire che le proposte rendano: l'intervallo comprende anche perdite.

## Altri dati

- **Modello e mercato.** Comando `market` del motore, 75 partite: Log Loss modello 0,9694, mercato 0,9500, combinazione con peso 0,7 0,9523 e con 0,8 0,9512. Brier delle giocate delle schedine (408): modello 0,2178, peso 0,75 0,2110, mercato 0,2100.
- **Selezione «a valore».** Con peso 0,5 una giocata ha valore soprattutto quando il modello è più ottimista del mercato. Sono proprio i casi in cui il modello sbaglia di più: le giocate date in media al 51% sono uscite il 39%.
- **Tiri e xG** (comando `stats`): 475 partite con statistiche su 8.773, guadagno di Log Loss 0,0017 solo su quelle. Nessuna modifica (runbook del motore).
- **Quote storiche.** I risultati delle partite ci sono dal 2022 (8.773 partite, usate per allenare e verificare il modello), le quote solo da novembre 2026. Il ritorno di una giocata si misura solo con le quote di allora. The Odds API vende lo storico solo nei piani a pagamento, football-data.co.uk è escluso (ADR 0004).

## Decisione

1. **Peso del mercato 0,75** (era 0,5) in `DEFAULT_BET_BUILDER_RULES` e in `Rules` del motore (`rules_version` 2026.11.25-1). Lo stesso peso vale per le schedine consigliate (`MARKET_WEIGHT` lo legge da qui) e per il calcolo di Kelly nelle giocate fatte. Le proposte con valore saranno meno: restano quelle in cui la quota italiana supera la probabilità anche dando al mercato tre quarti del peso.
2. **Analisi onesta** (`slips.analysis.ts`): proposte contate una volta sola, tutte quelle già decise e non solo gli ultimi 30 giorni, intervallo al 95% del ritorno, prova del peso del mercato sulle giocate salvate.
3. **Il modello resta quello attivo.** Le prove fatte (tempo, neopromosse, Elo, Dixon-Coles, taratura per mercato, stacking, tiri e xG) sono nel runbook del motore. Con i soli risultati delle partite è vicino al suo limite.

## Conseguenze

- Meno proposte con valore. Nessuna regola garantisce un ritorno positivo: le quote dei bookmaker contengono informazioni (formazioni, infortuni, notizie) che il modello non ha.
- L'analisi va rifatta ogni due o tre settimane: con qualche centinaio di proposte distinte l'intervallo si stringe e dirà se rendono davvero.
