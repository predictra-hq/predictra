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
- **Dati calcistici, quote, previsioni e proposte:** nessuna cancellazione. Servono a backtest, riproducibilità ([ADR 0020](0020-versioning-previsioni.md)) e CLV; le proposte sono immutabili per contratto.
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
