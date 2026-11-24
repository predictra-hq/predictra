# ADR 0069 — API-Football solo da IP non condivisi

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

- **Mai dai runner di GitHub.** Se `RUNNER_ENVIRONMENT` è `github-hosted`, l'agente non pianifica API-Football e il lavoro va subito in `dead`; il workflow `data-collector` salta i lavori `api-football-*`. Da un runner self-hosted con IP dedicato, o da una macchina propria, le chiamate restano possibili.
- **Account sospeso.** La risposta «Your account is suspended» manda il lavoro in `dead` senza nuovi tentativi.
- **Limite al minuto.** Le chiamate rimaste nel minuto passano dal primo al secondo client, e la riserva sale da 1 a 2 (`MINUTE_RESERVE`).

## Conseguenze

- Senza un runner self-hosted con IP dedicato, PREDICTRA non chiama più API-Football. Statistiche e formazioni aggiuntive delle partite nuove mancano; partite, risultati, quote e modello non cambiano (football-data.org e The Odds API).
- Un nuovo account usato dagli stessi runner verrebbe con ogni probabilità sospeso di nuovo. I termini di API-Football vietano più account per superare il piano Free e l'uso di account altrui: PREDICTRA usa un solo account, intestato a chi lo gestisce.
