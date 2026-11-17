# ADR 0042 — Ask PREDICTRA con un LLM gratuito

**Stato:** Accettata (PR #51 unita da `gennpalm` il 9/11/2026; `GROQ_API_KEY` configurata su Vercel DEV) · **Data:** 2026-11-09

## Contesto

- Ask PREDICTRA è la chat della navigazione principale (Prompt Master §16.1). Il [piano M0](../architecture/M0-piano-tecnico.md) l'ha **disattivata nella v1** (decisione D6) perché non c'era un LLM gratuito garantito. Oggi la voce compare disattivata con l'etichetta "M8" e la pagina `/ask` non esiste.
- Vincoli dalle regole di `CLAUDE.md`:
  - **budget €0** (regola 7): nessun servizio a pagamento senza approvazione del proprietario. Se il piano gratuito non basta, si dichiara il limite e si degrada in modo controllato;
  - **le probabilità vengono solo dai modelli quantitativi, mai da un LLM** (regola 5), e **mai dati inventati** (regola 3);
  - **mai segreti nel frontend** (regola 6);
  - la piattaforma non piazza scommesse (regola 10).
- I dati personali (bankroll, giocate) sono visibili solo al proprietario e non agli admin (ADR 0030). Mandarli a un fornitore esterno sarebbe una nuova condivisione.
- Utenti: poche persone su invito, quindi poche decine di domande al giorno.

## Opzioni gratuite (verificate il 9/11/2026)

Le cifre dei limiti cambiano spesso: vanno ricontrollate nella console del fornitore prima dell'attivazione.

| Opzione                                      | Piano gratuito                                                                                                                                                           | Dati inviati                                                                                                                                                                                                       | Esito                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Groq** (modelli open, es. gpt-oss)      | piano Free, senza carta; oltre il limite risponde 429 e non addebita nulla. Limiti esatti nella console dell'organizzazione                                              | ["Your data"](https://console.groq.com/docs/your-data): per default non conserva i dati delle richieste; log fino a 30 giorni solo per affidabilità e abusi; **Zero Data Retention** attivabile da tutti i clienti | **proposta**                                                                                                                                                                    |
| **B. Cloudflare Workers AI**                 | 10.000 Neuron al giorno, anche sul piano Workers Free ([prezzi](https://developers.cloudflare.com/workers-ai/platform/pricing/)); oltre il limite le chiamate falliscono | conservazione non verificata                                                                                                                                                                                       | **riserva**: circa 200 Neuron per domanda con Llama 3.3 70B (4.000 token in ingresso, 500 in uscita), quindi circa 45 domande al giorno                                         |
| C. Google Gemini (piano gratuito)            | sì, con limiti ridotti                                                                                                                                                   | [termini](https://aistudio.google.com/docs/terms) (in vigore dal 23/3/2026): i contenuti dei servizi gratuiti servono a migliorare i prodotti Google e possono essere letti da revisori umani                      | **esclusa**: per utenti nello Spazio economico europeo, Svizzera e Regno Unito i termini consentono **solo i servizi a pagamento**                                              |
| D. GitHub Models                             | stato incerto: fonti secondarie indicano il ritiro nel luglio 2026                                                                                                       | —                                                                                                                                                                                                                  | **esclusa** finché non è confermato da GitHub                                                                                                                                   |
| E. Claude Haiku 5.5 (Anthropic, a pagamento) | nessun piano gratuito; $0,10 per milione di token in ingresso e $0,50 in uscita                                                                                          | API commerciale                                                                                                                                                                                                    | **fuori budget €0**: circa $0,0007 per chiamata e $0,002 a domanda con gli strumenti (1–2 $ al mese con 30 domande al giorno). Solo con approvazione esplicita del proprietario |

## Decisione proposta

Attivare Ask PREDICTRA con **Groq (opzione A)** come fornitore e **Cloudflare Workers AI (opzione B)** come riserva. La chat **spiega i dati che PREDICTRA ha già calcolato e non produce numeri propri**.

### 1. Cosa può fare

- Rispondere su partite, previsioni del modello attivo, quote reali, statistiche di squadre e campionati, stato dei modelli e proposte del Bet Builder.
- Il modello linguistico **non ha accesso al database**. Può chiamare solo strumenti in sola lettura scritti da noi, che interrogano le viste già esistenti **con la sessione dell'utente**, quindi con RLS:
  - `cerca_partita` → `v_match_center`;
  - `previsioni_partita` → `v_active_predictions`;
  - `quote_partita` → `v_latest_odds`, `v_best_odds_h`;
  - `statistiche_squadra` → `v_team_season_stats`, `v_team_form`;
  - `classifica` → `v_latest_standings`;
  - `modello_attivo` → `v_model_versions_summary`;
  - `proposte` → `v_active_bet_proposals`, `v_bet_proposal_legs`.
- **Escluso nella v1:** bankroll, giocate e qualsiasi dato personale. Non escono da Supabase.

### 2. Niente numeri inventati

- Il prompt di sistema vieta di stimare probabilità, quote o statistiche e chiede di citare solo i valori restituiti dagli strumenti.
- **Controllo lato server:** ogni numero della risposta (percentuali, quote, conteggi) deve comparire nei risultati degli strumenti di quella domanda. Altrimenti la risposta viene scartata e l'utente vede solo i dati degli strumenti, con un avviso.
- Sotto ogni risposta un riquadro **Fonti** costruito dal server con i dati degli strumenti: provider, `observed_at`, versione del modello. Non è scritto dall'LLM.
- Avviso fisso: risposta informativa, non un consiglio di scommessa.

### 3. Sicurezza e limiti

- Chiamata solo lato server (Server Action) dopo `requireUser`. Come le altre sezioni della navigazione principale, Ask è aperta a **ogni utente attivo**: niente permesso dedicato (scelta presa in fase 0, più semplice del permesso `ask.use` ipotizzato).
- Chiave `GROQ_API_KEY` solo nelle variabili server di Vercel, **mai** con prefisso `NEXT_PUBLIC_`. Zero Data Retention attivato nella console Groq.
- **Quota per utente:** per esempio 30 domande al giorno, in una tabella `ask_usage` con RLS (ogni utente vede solo la propria). Oltre la quota, o quando il fornitore risponde 429, si mostra un messaggio chiaro e si passa alla riserva se configurata. Nessun errore muto.
- **Interruttore:** la chat è attiva solo se c’è `GROQ_API_KEY`; `ASK_ENABLED=false` la spegne anche con la chiave presente.
- **Log:** utente, ora, strumenti usati, token ed esito del controllo sui numeri. Il **testo delle domande non viene salvato** finché l'ADR 0041 (conservazione) non lo regola.
- Le chiamate HTTP vanno all'endpoint compatibile OpenAI dei due fornitori con `fetch` dietro una piccola interfaccia `LlmProvider`. Così si cambia fornitore senza toccare la pagina.

## Conseguenze

- **Costo:** €0 finché si resta nei piani gratuiti. Superato il limite il servizio si ferma (429) e non addebita nulla.
- **Rischio:** i limiti gratuiti possono cambiare senza preavviso. Il degrado è controllato: messaggio all'utente, poi la riserva, poi l'interruttore.
- **Qualità:** i modelli open gratuiti sono meno capaci dei modelli a pagamento. Il controllo sui numeri e gli strumenti in sola lettura limitano il danno: al peggio la risposta è poco utile, non sbagliata nei numeri.
- **Fornitori:** si aggiunge un fornitore esterno (Groq). L'account va creato dal proprietario; la chiave va nei segreti di Vercel, mai nel codice o in chat.

## Se approvata: fasi

| Fase  | Contenuto                                                                                                                                             | Corsia |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P     | `gennpalm` crea l'account Groq, attiva Zero Data Retention e mette `GROQ_API_KEY` su Vercel (DEV)                                                     | —      |
| 0     | Contratto: tabella `ask_usage` con RLS, RPC `ask_consume` e `ask_record`, test                                                                        | 0      |
| A     | `lib/ask/`: interfaccia `LlmProvider`, strumenti in sola lettura, controllo sui numeri con test unitari (risposte con numeri non presenti → scartate) | A      |
| B     | Pagina `/ask`: chat, riquadro Fonti, quota residua, avvisi; voce di navigazione attiva                                                                | B      |
| Verif | Prova su DEV con domande reali; il controllo di accessibilità (_Verifica DEV_) include `/ask`                                                         | —      |

## Alternativa

Se la proposta non è approvata: Ask PREDICTRA resta disattivata nella v1. L'etichetta "M8" nella navigazione diventa "Non attiva nella v1", per non far pensare che arrivi in questa milestone.

## Aggiornamento del 16/11/2026: dati della stagione in corso e risposte leggibili

Segnalazione del proprietario: alla domanda sul Napoli la risposta citava 8 partite e 11 punti, mentre in classifica erano 11 partite e 15 punti.

- **Causa.** `statistiche_squadra` prendeva le due stagioni con l'id più alto. Lo storico 2022–2024 è stato caricato dopo la stagione in corso, quindi ha id più alti: uscivano stagioni vecchie, senza dire quali.
- **Correzione.** Lo strumento ora sceglie la stagione per data d'inizio (`currentSeasonRows`, testata), dà una riga per competizione con nome della competizione, stagione e posizione in classifica. `classifica` sceglie la stagione più recente per etichetta e una sola competizione.
- **Strumenti nuovi, in sola lettura:** `partite_campionato` (prossime o ultime partite di un campionato) e `giocate_piu_probabili` (le stesse della pagina Certezze). Le probabilità restano quelle del modello e del mercato: l'assistente le legge, non le calcola.
- **Prompt.** Deve chiamare sempre uno strumento prima di rispondere sul calcio e dire a quale competizione e stagione si riferisce un dato.
- **Formato.** L'assistente può usare `**grassetto**` ed elenchi con `- `; l'interfaccia li disegna (`lib/ask/rich-text.ts`, testato) e toglie gli altri simboli. Il controllo sui numeri non cambia.

## Aggiornamento del 17/11/2026: guida all'uso e seconda possibilità

Segnalazione del proprietario: alla domanda «mi fai un recap su come usare l'applicativo?» la risposta è stata scartata per un numero (7) e sotto non c'era alcun dato.

- **Causa.** Nessuno strumento descriveva l'app: l'assistente rispondeva a memoria, con un elenco numerato o un conteggio delle sezioni, e il controllo lo scartava giustamente.
- **Strumento `guida_app`.** Restituisce le sezioni del menu, le pagine e a cosa servono, da un testo fisso in `lib/i18n/it.ts` (`ask.guide`, senza numeri). Le domande sull'uso dell'app hanno così una fonte.
- **Seconda possibilità.** Se la risposta cita numeri non presenti nei dati, si chiede una volta all'assistente di riscriverla senza quei numeri. Se anche la seconda risposta li contiene, viene scartata come prima. Il controllo non si allenta: cambia solo il numero di tentativi (al massimo una chiamata in più al fornitore).
- **Messaggio.** Se una risposta è scartata e non ci sono dati da mostrare, l'avviso invita a riformulare la domanda invece di dire «Ecco i dati trovati».
- Test: `lib/ask/run.test.ts`.
