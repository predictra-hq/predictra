# ADR 0069 — API-Football: sospensione gestita e IP condivisi

- **Stato:** accettato (24/11/2026)
- **Milestone:** M8 (corsia A)
- **Aggiorna:** ADR 0012 (statistiche e formazioni API-Football)

## Contesto

Il 24/11/2026 l'account API-Football risultava sospeso già alla prima chiamata del giorno. Dai log:

- **Ultima raccolta riuscita:** il 23/11 alle 02:00 UTC, entro il budget di 90 richieste.
- **Notte tra 23 e 24/11:** nessuna chiamata. Le esecuzioni erano bloccate da GitHub per i minuti finiti, senza nessun passo eseguito.
- **Quota giornaliera:** esclusa. Il 24/11 non c'era ancora stata nessuna richiesta.

API-Football non indica il motivo. Le piste trovate:

1. **IP condivisi.** Secondo una segnalazione pubblica di un altro progetto (MatrixLabSports/MATRIX-LAB, issue #3), il supporto di API-SPORTS spiega che un IP di uscita condiviso fa scattare i controlli contro i doppi account e sospende il piano Free, anche con 0 richieste. Esempi di IP condivisi: cloud, VPN, proxy, i runner ospitati da GitHub su Azure. Come soluzione accettano un runner self-hosted con un IP pubblico dedicato. Lo stesso sito di API-SPORTS ha una notizia intitolata «Avoid rate-limit and suspension issues with shared IPs». Le nostre chiamate partivano proprio dai runner di GitHub. È la causa più probabile, ma non confermata dal provider.
2. **Limite al minuto.** Superarlo è una «material breach», con sospensione automatica. Il lavoro giornaliero usa due client in sequenza, e il secondo partiva senza sapere quante chiamate restavano nel minuto: al passaggio poteva sforare.

## Decisione

Il proprietario ha scelto di continuare a chiamare API-Football dai runner di GitHub, accettando il rischio di nuove sospensioni. Il codice limita i danni:

- **Account sospeso.** La risposta «Your account is suspended» manda il lavoro in `dead` senza nuovi tentativi, con l'impronta della chiave nell'errore: 12 caratteri dell'hash, che non rivelano la chiave.
- **Nessuna chiamata dopo la sospensione.** Prima di pianificare il lavoro del giorno, l'agente guarda l'ultimo lavoro API-Football finito in `dead` negli ultimi 7 giorni. Se riguarda la stessa chiave, salta API-Football. Dopo 7 giorni fa un solo controllo per vedere se l'account è tornato attivo. Con una chiave nuova riparte subito.
- **Limite al minuto.** Le chiamate rimaste nel minuto passano dal primo al secondo client, e la riserva sale da 1 a 2 (`MINUTE_RESERVE`).
- Se le sospensioni continuano, la soluzione è un runner self-hosted con un IP dedicato.

## Conseguenze

- Se l'account viene sospeso, PREDICTRA smette da sola di chiamarlo. Mancano solo statistiche e formazioni aggiuntive; partite, risultati, quote e modello non cambiano (football-data.org e The Odds API).
- Per riprendere subito basta aggiornare il secret `API_FOOTBALL_KEY` con una chiave valida.
