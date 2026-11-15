# ADR 0040 — Backup del database e test di ripristino

**Stato:** Accettata (opzione A, Backblaze B2: PR #31, 8/11/2026). Regione del bucket: `us-east-005`, confermata l'8/11/2026 · **Data:** 2026-11-08

## Contesto

- Supabase Free non fa backup automatici (ADR 0002, M0 §3). Oggi un errore o una cancellazione su DEV, e domani su PROD, sarebbero irrecuperabili.
- Budget €0 (regola 7 di `CLAUDE.md`): lo storage deve essere gratuito e senza servizi a pagamento attivati in automatico.
- I dati includono dati personali e finanziari degli utenti (M6, ADR 0030): il backup va **cifrato prima di uscire** da GitHub Actions.
- Dimensione attesa di un backup compresso: decine di MB. Da misurare con il primo dump reale.

## Decisione

### 1. Cosa e quando

- **Dump giornaliero** alle 02:30 UTC da un workflow di GitHub Actions (`backup.yml`) con la Supabase CLI già usata dal deploy (`supabase db dump`): ruoli, schema e dati in tre file. Il comando esatto si fissa nella corsia A, provandolo su DEV.
- **Cifratura** simmetrica AES-256 con `gpg` (già presente nei runner) e una passphrase nel segreto GitHub `BACKUP_PASSPHRASE`.
  - Il proprietario conserva una copia della passphrase **fuori da GitHub** (password manager personale): senza, i backup sono illeggibili.
- **Manifest** accanto a ogni backup: data, commit, dimensioni, SHA-256 dei file cifrati, conteggio delle righe delle tabelle principali. Serve al test di ripristino.
- **Conservazione:** gli ultimi **30 giornalieri** più il primo di ogni mese per **12 mesi**. Le copie più vecchie le cancella il workflow.
- **Test di ripristino mensile** (`backup.yml`, il giorno 1):
  1. scarica l'ultimo backup e lo decifra;
  2. lo ripristina in un Supabase locale avviato nel runner (`supabase start`);
  3. confronta i conteggi delle righe con il manifest;
  4. controlla che RLS e policy ci siano.

  L'esito è visibile in _Actions_; un fallimento fa fallire il workflow.

- **Ambienti:** oggi DEV. PROD userà lo stesso workflow con i segreti `PROD_*` quando esisterà.
- **Minuti di GitHub Actions:** circa 2–3 al giorno per il dump e 10 al mese per il ripristino, quindi circa 100 al mese.

### 2. Dove salvare i backup: opzioni gratuite (verificate l'8/11/2026)

| Opzione                                                             | Gratis                                                                                                                  | Carta di credito                                                             | Pro                                                                                                                                 | Contro                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Backblaze B2**                                                 | primi 10 GB di storage; chiamate API di classe A, B e C gratuite; download fino a 3 volte lo spazio occupato al mese    | il sito dice "No credit card required" alla registrazione                    | fornitore separato da GitHub e Supabase (vero off-site); API S3; **Object Lock** (WORM) contro cancellazioni accidentali o malevole | un account in più da gestire; termini sulla sospensione degli account gratuiti non letti                                                |
| **B. Cloudflare R2**                                                | 10 GB-mese di storage Standard; 1 milione di operazioni di classe A e 10 milioni di classe B al mese; download gratuiti | **non verificato**: l'attivazione richiede un "checkout" dell'abbonamento R2 | download gratuiti, API S3, regole di ciclo di vita                                                                                  | possibile carta richiesta; Object Lock non verificato (pagina 404)                                                                      |
| **C. Repository GitHub privato separato** (es. `predictra-backups`) | sì; file massimi 100 MiB; repository consigliato sotto 1 GB; Git LFS 10 GiB                                             | no                                                                           | nessun account nuovo; accessi già gestiti                                                                                           | la documentazione GitHub dice "Git is not designed to serve as a backup tool"; la storia cresce per sempre; stesso fornitore del codice |
| **D. Artifact di GitHub Actions**                                   | 500 MB in tutto (condivisi con Packages), conservazione da 1 a 400 giorni                                               | no                                                                           | nessuna configurazione                                                                                                              | quota piccola: oltre il limite, senza metodo di pagamento, l'uso viene bloccato; stesso fornitore del codice                            |

Fonti:

- Backblaze: https://www.backblaze.com/cloud-storage/pricing, https://www.backblaze.com/cloud-storage, https://www.backblaze.com/cloud-storage/transaction-pricing.
- Cloudflare: https://developers.cloudflare.com/r2/pricing/, https://developers.cloudflare.com/r2/get-started/, https://developers.cloudflare.com/r2/buckets/object-lifecycles/.
- GitHub: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions, https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization, https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github, https://docs.github.com/en/billing/concepts/product-billing/git-lfs.

**Proposta: A, Backblaze B2.**

- È l'unica opzione con tutte e tre le caratteristiche: off-site, senza carta dichiarata e con Object Lock.
- Con 30 giornalieri e 12 mensili da circa 20 MB si occupa meno di 1 GB, ben dentro i 10 GB gratuiti.
- Il download serve solo al test di ripristino mensile, quindi resta sotto la soglia gratuita.
- **Copia di riserva:** l'ultimo backup cifrato resta anche come artifact di GitHub Actions per 7 giorni (opzione D). Con meno di 100 MB in tutto rientra nella quota di 500 MB, e così c'è un ripristino rapido anche se B2 non è raggiungibile.

### 3. Cosa serve dal proprietario (se approva A)

1. Account gratuito su https://www.backblaze.com e un bucket **privato** (es. `predictra-backups`), con Object Lock attivo se disponibile.
2. Una **application key limitata a quel bucket**, con i soli permessi necessari.
3. Segreti GitHub:
   - `BACKUP_PASSPHRASE`, almeno 32 caratteri casuali, conservata anche in un password manager;
   - `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`;
   - `B2_ENDPOINT`, l'endpoint S3 del bucket, mostrato da Backblaze.
4. Rileggere i termini di servizio di Backblaze (https://www.backblaze.com/company/policy/terms-of-service), che non ho letto, in particolare sugli account gratuiti.

## Attuazione (M8 corsia A, 8/11/2026)

- Workflow `backup.yml` e script in `scripts/backup/`; runbook in [backup-restore.md](../operations/backup-restore.md).
- I dati si salvano solo per gli schemi `public` e `auth`. Lo schema `storage` di Supabase non contiene dati dell'app e il suo ripristino falliva per i permessi.
- **Prima prova:** dump di 3,3 MB, 283 KB cifrati. Test di ripristino superato: 18 tabelle su 18 con lo stesso numero di righe e 44 policy RLS.
- **Regione del bucket: `us-east-005` (Stati Uniti), confermata l'8/11/2026 (Alfry1299).** I backup contengono dati personali (account, in futuro bankroll), ma sono cifrati prima di uscire da GitHub e Backblaze non ha la passphrase. Spostarsi in Europa resta possibile: serve un account Backblaze nuovo con regione europea e l'aggiornamento dei segreti `B2_*`; il codice non cambia.
- **In servizio:** primo backup reale su B2 l'8/11/2026 (282 KB, giornaliero e mensile di novembre); test di ripristino scaricando da B2 superato (18 tabelle su 18, 44 policy RLS).
- **Object Lock** non disponibile con la chiave attuale ("not entitled"): la protezione contro la cancellazione resta da valutare.

## Conseguenze

- Con il primo backup su B2 e il primo test di ripristino riuscito si chiude la fase A1 di M8.
- La sicurezza dei backup dipende dalla passphrase: se va persa, i backup non si possono ripristinare; se trapela, va ruotata e i backup successivi usano quella nuova.
- Se il proprietario sceglie un'altra opzione, cambiano solo il passo di upload e i segreti; dump, cifratura, manifest e test di ripristino restano uguali.
