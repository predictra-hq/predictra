# Backup e ripristino — runbook (M8)

Decisione: [ADR 0040](../decisions/0040-backup.md). Workflow: `.github/workflows/backup.yml`. Script: `scripts/backup/`.

## Come funziona

```text
ogni giorno 02:30 UTC  backup
  1. conteggio delle righe delle tabelle principali (chiave secret)
  2. supabase db dump: ruoli, schema (tutti), dati (schemi public e auth)
  3. manifest.json con conteggi e SHA-256 dei file
  4. tar.gz cifrato con gpg AES-256 e BACKUP_PASSPHRASE  →  predictra-dev-<data>.tar.gz.gpg
  5. B2: dev/daily/<AAAA-MM-GG>/ e, se è il primo del mese, dev/monthly/<AAAA-MM>/
  6. rotazione: giornalieri oltre 30 giorni e mensili oltre 12 mesi cancellati
  7. nessuna copia come artifact: con il repository pubblico (ADR 0068) la scaricherebbe chiunque
giorno 1 di ogni mese 03:30 UTC  restore-test
  ultimo backup da B2 → verifica SHA-256 → decifratura → Supabase locale nel runner (supabase db start)
  → ripristino (roles, schema, data con session_replication_role = replica)
  → confronto delle righe con il manifest, policy RLS presenti, nessuna tabella public senza RLS
```

**In servizio dall'8/11/2026:** primo backup su B2 (`dev/daily/2026-11-08/`, copia mensile `dev/monthly/2026-11/`) e test di ripristino scaricando da B2 superato.

**Prima prova reale (8/11/2026, branch, senza caricamento):**

- dump: 3,3 MB di dati, **283 KB** cifrati;
- ripristino: 18 tabelle su 18 con lo stesso numero di righe (es. 2.508 partite, 10.405 quote, 3.838 previsioni), 44 policy RLS, nessuna tabella senza RLS.

## Segreti

| Segreto                                                                                                   | Uso                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `BACKUP_PASSPHRASE`                                                                                       | cifratura e decifratura. **Copia anche fuori da GitHub**: senza, i backup sono illeggibili |
| `B2_KEY_ID`, `B2_APPLICATION_KEY`                                                                         | chiave Backblaze limitata al bucket (Read and Write)                                       |
| `B2_BUCKET`                                                                                               | nome del bucket privato                                                                    |
| `B2_ENDPOINT`                                                                                             | endpoint S3, es. `https://s3.<regione>.backblazeb2.com`                                    |
| `SUPABASE_ACCESS_TOKEN`, `DEV_SUPABASE_PROJECT_ID`, `DEV_SUPABASE_DB_PASSWORD`, `DEV_SUPABASE_SECRET_KEY` | già presenti per il deploy                                                                 |

## Avvio manuale

_Actions → Backup → Run workflow_, branch `dev`:

- `action = check`: scrive, legge e cancella un file di prova su B2 e mostra la regione;
- `action = backup`:
  - `upload` disattivato: nessun caricamento su B2 e nessuna copia conservata (utile solo con `verify`);
  - `verify` attivo: prova subito il ripristino del backup appena creato (circa 5 minuti in più);
- `action = restore-test`: test di ripristino dell'ultimo backup su B2.

Schedule e pulsante esistono solo quando il workflow è anche su `main`.

## Ripristino reale (emergenza)

Si fa a mano, su un progetto Supabase **nuovo o vuoto**, mai su quello in uso se non è perso.

1. Scarica il backup da B2 (_Browse Files_).
2. Decifra ed estrai:

   ```bash
   gpg --decrypt predictra-dev-<data>.tar.gz.gpg | tar -xzf -
   ```

   La passphrase è `BACKUP_PASSPHRASE`. Controlla gli SHA-256 con `backup/manifest.json`.

3. Ripristina con la procedura della documentazione Supabase:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command "SET session_replication_role = replica" \
     --file backup/data.sql --dbname "<connection string del nuovo progetto>"
   ```

4. Aggiorna i segreti `*_SUPABASE_*` e le variabili di Vercel con il nuovo progetto, poi rilancia il deploy.

## Limiti e note

- **Regione del bucket:** `us-east-005`, negli Stati Uniti, confermata l'8/11/2026. I backup sono cifrati prima di uscire da GitHub e Backblaze non può leggerli. Per spostarsi in Europa: account Backblaze nuovo con regione europea e aggiornamento dei segreti `B2_*`.
- **Object Lock:** non disponibile con la chiave attuale ("not entitled"). La rotazione e la cancellazione dipendono dalla chiave: se la chiave trapela, un attaccante potrebbe cancellare i backup. La copia come artifact, che riduceva il rischio per gli ultimi 7 giorni, è stata tolta quando il repository è diventato pubblico (ADR 0068): da valutare una seconda copia fuori da GitHub, per esempio un secondo bucket gratuito con chiave diversa.
- I dati degli schemi gestiti da Supabase (es. `storage`) non sono inclusi: PREDICTRA non li usa.
- Minuti di Actions: circa 3 al giorno per il backup e circa 8 al mese per il test di ripristino.
