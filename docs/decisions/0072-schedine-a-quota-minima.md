# ADR 0072 — Schedine con quota totale minima 3, 5 e 10

- **Stato:** accettato (25/11/2026); i numeri delle proposte con valore sono corretti dall'ADR 0073 (contavano le copie)
- **Milestone:** M8 (corsie A e B)
- **Aggiorna:** ADR 0071 (profili delle schedine)

## Contesto

Con l'ADR 0071 le schedine avevano una quota obiettivo (2, 3,5 e 7), ma se non ci arrivavano restava una schedina più bassa. Il proprietario vede ancora schedine sotto quota 2 e le giudica inutili: «meno di 2 è bassa, 2 o 3 non ha senso giocarle».

## Analisi sui dati veri

Il 25/11/2026, workflow «Verifica DEV» (`slip-analysis`), sezioni nuove dello script:

- **Giocate per fascia di quota.** Le giocate con quota italiana prima della partita sono ancora poche (circa 90): non bastano per scegliere le regole. Quasi nessuna ha valore positivo rispetto al consenso del mercato. Le quote dei bookmaker italiani sono di solito un po' sotto la quota giusta.
- **Schedine con quota minima obbligatoria** (3, 5, 8, 12): da 3 a 5 schedine per variante. Con così pochi casi gli esiti dipendono dalla fortuna e non scelgono una regola.
- **Proposte con valore del motore** (ultimi 30 giorni, quote più alte e poche partite): Aggressive a 3 partite vinte 9 su 36 con ritorno +73%; Equilibrate a 2 partite vinte 20 su 59 con ritorno +33%. Le singole prudenti hanno perso (ritorno −15%). Le proposte non sono indipendenti tra loro, ma vanno nella stessa direzione: poche partite con quote alte rendono meglio di molte partite «sicure».

## Decisione

1. **Quota totale minima, senza ripiego** (`strictTarget`): se nemmeno con le soglie allargate (fino a tre volte, come nell'ADR 0071) si arriva al minimo, quella schedina non si propone.

   | Profilo     | Giocate dal | Quota minima di ogni giocata | Partite (max) | Quota totale minima | Scelta                            |
   | ----------- | ----------- | ---------------------------- | ------------- | ------------------- | --------------------------------- |
   | Solida      | 60%         | 1,40                         | 5             | 3                   | più probabili (valore fino a −5%) |
   | Equilibrata | 50%         | 1,70                         | 5             | 5                   | probabilità + valore (fino a −3%) |
   | Alta quota  | 38%         | 2,00                         | 5             | 10                  | probabilità + valore (fino a −3%) |
   - Poche partite con quote alte: ogni partita in più moltiplica anche il margine del bookmaker.
   - Il valore dell'intera schedina non scende sotto −15%. La pagina mostra il valore solo quando è positivo.

2. **Profili mancanti spiegati.** Sotto le schedine del periodo compare quale profilo manca e perché. In fondo compaiono le quote minime (lette da `BOLLETTA_RULES`).
3. **Il modello predittivo non cambia.** Usa solo i risultati delle partite (dati gratuiti), mentre le quote dei bookmaker contengono anche infortuni, formazioni e notizie. Per questo il mercato indovina meglio (ADR 0071). Migliorarlo davvero richiede dati che a costo zero non ci sono: statistiche e formazioni della stagione in corso (API-Football a pagamento). La decisione spetta al proprietario (regola 7).

## Conseguenze

- Le schedine hanno quote più alte e si vincono meno spesso. Una schedina a quota 10 giusta vince in media meno di una volta su 10.
- In alcuni giorni ci sono meno di tre schedine: meglio niente che una schedina sotto la quota minima.
- L'analisi va rifatta quando ci saranno alcune settimane di schedine salvate.
