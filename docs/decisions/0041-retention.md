# ADR 0041 — Conservazione dei dati (retention)

**Stato:** Proposta (le durate le decide `gennpalm`) · **Data:** 2026-11-14

## Contesto

- Il [data dictionary dell'identità](../data-dictionary/identity.md) riporta "da definire in M8" per la conservazione di `audit_logs` e `invitations`. Il [piano M8](../roadmap/M8-hardening-e-produzione.md) riserva a questa scelta l'ADR 0041.
- Oggi nessun dato viene cancellato per anzianità, tranne i contatori del rate limit: `consume_rate_limit` elimina a ogni chiamata le finestre più vecchie di un giorno.
- `audit_logs` è **append-only**: un trigger blocca UPDATE, DELETE e TRUNCATE. È una difesa voluta (nemmeno un Super Admin può riscrivere lo storico).
- Vincoli: budget €0 e 500 MB di database sul piano Free di Supabase (M0 §3); pochi utenti su invito; i backup conservano 30 giornalieri e 12 mensili ([ADR 0040](0040-backup.md)), quindi un dato cancellato dal database resta nei backup fino a 12 mesi.
- I dati personali di bankroll e giocate sono visibili solo al proprietario ([ADR 0030](0030-bankroll-dati-e-privacy.md)).

## Proposta

### 1. Durate

- **`audit_logs`: conservazione illimitata nella v1.** Il volume è minimo (poche azioni amministrative al giorno) e togliere l'append-only per fare pulizia indebolirebbe il controllo più di quanto serva lo spazio recuperato. Si rivaluta se la tabella supera 50 MB.
- **`invitations`:** gli inviti scaduti (`EXPIRED`, o `PENDING` oltre la scadenza) e quelli `REVOKED` si conservano **12 mesi**, poi si cancellano. Quelli `ACCEPTED` restano finché esiste l'account: sono la prova di chi ha invitato chi.
- **Contatori del rate limit:** invariati (un giorno).
- **Code dell'agente:** `agent_jobs` conclusi (`done`) e `agent_runs` si conservano **90 giorni**; i job `dead` restano finché un amministratore non li riprende o li archivia. Le notifiche lette si conservano **90 giorni**.
- **Dati calcistici, quote, previsioni e proposte:** nessuna cancellazione, salvo le previsioni superate (aggiornamento del 17/11/2026, sotto). Servono a backtest, riproducibilità ([ADR 0020](0020-versioning-previsioni.md)) e CLV; le proposte sono immutabili per contratto.
- **Dati personali (bankroll, movimenti, giocate, limiti, schedine, preferenze):** restano finché esiste l'account. Li cancella solo il proprietario dei dati dall'app.
- **Ask PREDICTRA:** nessun testo salvato ([ADR 0042](0042-ask-predictra.md)); i contatori giornalieri della quota si conservano **30 giorni**.

### 2. Cancellazione di un account

Quando un utente chiede di essere rimosso, un Super Admin elimina l'account: i dati personali collegati si cancellano a cascata, mentre nell'audit deve restare l'evento con l'attore anonimizzato (`actor_id` a NULL, come prevede la chiave esterna `on delete set null`). **Attenzione:** il trigger append-only di `audit_logs` blocca gli UPDATE, quindi potrebbe bloccare anche questo azzeramento e far fallire la cancellazione dell'account: va verificato con un test (punto aperto 3). La procedura va scritta nel [runbook](../operations/runbook.md) e provata su DEV con un account di prova prima di usarla.

### 3. Come si applica

Un job giornaliero dell'agente (`maintenance.retention`) che chiama una funzione SQL `SECURITY DEFINER`, eseguibile solo da `service_role`, e scrive in `agent_runs` quante righe ha cancellato per tabella. Migrazione e test (PGlite) in una PR dedicata della corsia A, **dopo** l'accettazione di questo ADR: finché resta una proposta non si cancella nulla.

## Conseguenze

- Il database cresce solo con i dati che servono ai modelli; code e notifiche restano piccole.
- Un dato cancellato resta nei backup cifrati fino a 12 mesi: va detto agli utenti che chiedono la rimozione.
- L'audit resta integro e non modificabile.

## Punti aperti (decide `gennpalm`)

1. Confermare le durate: 12 mesi per gli inviti non accettati, 90 giorni per code e notifiche.
2. Audit illimitato oppure con un limite (per esempio 24 mesi): un limite richiede di allentare il trigger append-only per il solo job di pulizia.
3. Verificare con un test PGlite, e poi su DEV con un account di prova, che la cancellazione di un account riesca: quali tabelle si cancellano a cascata (`ON DELETE`) e se il trigger append-only di `audit_logs` lascia passare l'azzeramento di `actor_id`. Solo dopo si scrive la procedura della sezione 2.

## Aggiornamento del 17/11/2026: previsioni superate (deciso dal proprietario)

**Stato di questa parte: accettata.**

Misura del 17/11/2026: database a 91 MB, di cui 49 MB di previsioni, che crescevano di circa 12.000 righe (5 MB) al giorno, perché il motore riscrive le previsioni delle partite in programma due volte al giorno. Con il limite di 500 MB del piano Free il database si sarebbe riempito verso febbraio 2027.

Decisione: a fine giro il motore chiama `prune_predictions`, che cancella le previsioni e le matrici dei risultati esatti **più vecchie di 7 giorni** che l'app non usa più. L'app legge solo `v_active_predictions` (versione attiva) e `v_pre_kickoff_predictions` (famiglia del modello attivo). Restano sempre:

- l'ultima previsione di ogni partita, mercato, linea ed esito della **famiglia del modello attivo**: per una partita giocata è quella prima del calcio d'inizio, usata da Certezze, Affidabilità, verifica del peso del mercato e controlli del modello;
- l'ultima di ogni versione **attiva o in gara** (le partite in programma);
- l'ultima in assoluto per partita, mercato, linea ed esito, di qualunque modello: nessuna partita resta senza previsioni;
- le previsioni degli ultimi 7 giorni;
- quelle usate da una proposta del Bet Builder o da una schedina di un utente.

Messa a punto del 17/11/2026, provata su DEV: con la prima regola, che teneva l'ultima di ogni versione e poi di ogni famiglia, non c'era nulla da cancellare. Le previsioni vecchie erano soprattutto del modello Poisson, tolto dalla gara il 14/11/2026, o di versioni ritirate a ogni modifica del codice del modello (migrazioni `20261117120000`, `20261117140000`, `20261117160000`).

La riproducibilità resta: una versione del modello è immutabile e i dati di addestramento sono conservati, quindi ogni previsione cancellata si può ricalcolare. Le cancellate restano anche nei backup per 12 mesi (ADR 0040). Fuori da questa funzione le previsioni restano immutabili (test in `supabase/tests/predictions.test.ts`).
