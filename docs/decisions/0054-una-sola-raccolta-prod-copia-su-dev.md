# ADR 0054 — Una sola raccolta dati: PROD raccoglie, DEV riceve una copia

- **Stato:** accettato (16/11/2026, scelta del proprietario)
- **Milestone:** M8 (A4, ambiente PROD)

## Contesto

Con l'ambiente PROD i dati delle fonti (partite, classifiche, quote, statistiche) servono in due database. Le chiavi gratuite delle fonti bastano per una sola raccolta (The Odds API: 500 crediti al mese; API-Football: 100 richieste al giorno). Il proprietario non vuole chiamate in più: ogni dato si scarica una volta sola.

## Decisione

1. **Solo PROD parla con le fonti.** Agente, raccolte, motore delle previsioni, schedine e backup lavorano su PROD quando la variabile del repository `DATA_TARGET` vale `prod` e il workflow gira su `main` (programmato o avviato da QStash su PROD).
2. **DEV riceve una copia ogni giorno** (workflow _Copia dati tra ambienti_, 05:23 UTC): dati calcistici e calcolati letti dal database di PROD e riscritti in quello di DEV, con gli stessi id. Nessuna chiamata alle fonti.
3. **Account e dati personali non si copiano mai.** Utenti, ruoli, inviti, audit, bankroll, giocate, schedine personali, utilizzo di Ask e notifiche restano nel loro ambiente. L'elenco delle tabelle è in `scripts/sync/tables.sh`; un test (`supabase/tests/sync-tables.test.ts`) obbliga a classificare ogni tabella nuova.
4. **Avvio di PROD:** una sola copia da DEV a PROD (direzione `dev-to-prod`), insieme allo stato dell'agente, così PROD riprende da dove era arrivato DEV senza ripetere chiamate già fatte. Il workflow la rifiuta quando PROD è già in servizio.
5. Con `DATA_TARGET=prod`, un ciclo dell'agente o una raccolta avviati su `dev` non chiamano le fonti: si fermano con un avviso. Il motore e le schedine avviati a mano su `dev` scrivono su DEV, per provare una modifica al modello.

## Come funziona la copia

`scripts/sync/copy-data.sh`, in un'unica transazione nella destinazione: con `session_replication_role = replica` (procedura dei ripristini di Supabase) cancella le tabelle copiate e le ricarica dal dump di sola lettura dell'origine, poi confronta il numero di righe. Se qualcosa va storto la destinazione resta com'era. Le giocate di DEV che puntano a una partita o a una previsione restano valide, perché gli id sono gli stessi nei due ambienti dall'avvio in poi. Provata in locale su due database con le migrazioni reali: giocate e bankroll conservati, partita aggiornata, contatori degli id allineati.

## Alternative scartate

- **Scrittura doppia nel momento della raccolta:** ogni raccolta dipenderebbe da due database insieme e un problema su DEV toccherebbe PROD.
- **DEV come produzione:** ogni push su `dev` andrebbe subito agli utenti.
- **Raccolta separata nei due ambienti:** raddoppia le chiamate e supera i limiti gratuiti.

## Conseguenze

- I dati su DEV sono vecchi al massimo di un giorno.
- Le previsioni e le schedine su DEV sono quelle di PROD: per provare un modello nuovo si avvia il motore a mano su `dev`, e la copia del giorno dopo le riallinea.
- Il backup programmato salva PROD (`ENVIRONMENT=prod` nel nome del file); DEV si ricostruisce dalla copia.
- La copia giornaliera costa pochi minuti di GitHub Actions e tiene attivo il progetto Supabase di DEV (sul piano gratuito i progetti inattivi vengono sospesi dopo una settimana).
