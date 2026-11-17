# Messa in produzione — cosa fare, passo per passo

Per il proprietario (`gennpalm`). Tempo stimato: circa un'ora. Scelta di fondo: [ADR 0054](../decisions/0054-una-sola-raccolta-prod-copia-su-dev.md), cioè solo PROD scarica i dati e DEV ne riceve una copia ogni giorno.

Il codice è già pronto su `dev`: finché non fai il passo 7 tutto continua a funzionare come oggi, su DEV.

## Parte 1 — Preparazione (non cambia nulla per nessuno)

**1. Supabase: nuovo progetto**

- [supabase.com](https://supabase.com) → _New project_ → nome `predictra-prod`, stessa regione di DEV, password del database lunga (salvala nel tuo gestore di password).
- Il piano gratuito permette due progetti attivi: DEV e PROD.
- Annota: _Project ID_ (Settings → General), _password del database_, chiave _publishable_ e chiave _secret_ (Settings → API Keys).

**2. Vercel: nuovo progetto**

- _Add New → Project_ → importa `predictra-hq/predictra` → nome `predictra-prod`, _Root Directory_ `apps/web`.
- **Non** attivare l'integrazione Supabase di Vercel.
- Annota il _Project ID_ (Settings → General, inizia con `prj_`) e l'indirizzo del sito (es. `https://predictra-prod.vercel.app`).

**3. Vercel: variabili del progetto `predictra-prod`**

_Settings → Environment Variables_, ambiente **Production**:

| Nome                                   | Tipo   | Valore                                     |
| -------------------------------------- | ------ | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Config | `https://<Project ID di PROD>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | chiave publishable di PROD                 |
| `SUPABASE_SECRET_KEY`                  | Secret | chiave secret di PROD                      |
| `APP_BASE_URL`                         | Config | indirizzo del sito PROD, senza `/` finale  |
| `GROQ_API_KEY`                         | Secret | la stessa di DEV (Chiedi a PREDICTRA)      |
| `QSTASH_CURRENT_SIGNING_KEY`           | Secret | la stessa di DEV                           |
| `QSTASH_NEXT_SIGNING_KEY`              | Secret | la stessa di DEV                           |
| `GITHUB_DISPATCH_TOKEN`                | Secret | lo stesso di DEV                           |
| `GITHUB_DISPATCH_REF`                  | Config | `main`                                     |

**4. GitHub: segreti**

`predictra-hq/predictra` → _Settings → Secrets and variables → Actions → Secrets → New repository secret_:

| Nome                        | Valore                         |
| --------------------------- | ------------------------------ |
| `PROD_SUPABASE_PROJECT_ID`  | Project ID di PROD             |
| `PROD_SUPABASE_DB_PASSWORD` | password del database di PROD  |
| `PROD_SUPABASE_SECRET_KEY`  | chiave secret di PROD          |
| `PROD_APP_BASE_URL`         | indirizzo del sito PROD        |
| `PROD_VERCEL_PROJECT_ID`    | Project ID di Vercel (`prj_…`) |

Il token `SUPABASE_ACCESS_TOKEN` che c'è già vale per tutti i progetti del tuo account Supabase: non serve cambiarlo.

## Parte 2 — Accensione (fai i passi 5–8 di seguito, nello stesso pomeriggio)

**5. Pubblica PROD**

- GitHub → _Pull requests → New_ → da `dev` a `main` → crea la PR → _Merge_ con **Create a merge commit**.
- Il job _Deploy PROD_ parte da solo: database, impostazioni di accesso, sito. Aspetta che sia verde (circa 10 minuti).
- Se GitHub cancella il branch `dev` dopo il merge, il workflow _Ripristino di dev_ lo ricrea da solo.

**6. Riempi PROD con i dati di DEV (una volta sola)**

- _Actions → Copia dati tra ambienti → Run workflow_ → branch `main`, direzione **`dev-to-prod`**.
- Aspetta che sia verde: alla fine elenca le tabelle con lo stesso numero di righe nei due database.

**7. Accendi PROD**

- _Settings → Secrets and variables → Actions → Variables → New repository variable_: nome `DATA_TARGET`, valore `prod`.
- Da questo momento agente, previsioni, schedine e backup lavorano su PROD, e DEV riceve la copia ogni mattina alle 06:23 (ora italiana).

**8. QStash: sposta il richiamo su PROD**

- Console di Upstash → _QStash → Schedules_ → apri lo schedule esistente e cambia l'indirizzo in `https://<indirizzo PROD>/api/jobs/cycle`. Deve restarne uno solo.

## Parte 3 — Il tuo account e la verifica

**9. Il tuo Super Admin su PROD**

- _Actions → Bootstrap Super Admin → Run workflow_ → ambiente `prod`, con la tua email.
- Il link di attivazione compare solo nel riepilogo (_Summary_) del run, vale 24 ore. Aprilo, scegli nome e password (almeno 12 caratteri) e attiva la 2FA in _Profilo → Sicurezza_.
- Poi elimina il run (menu ⋯ → _Delete workflow run_).

**10. Invita gli altri**

- Da PROD: _Profilo → Amministrazione → Utenti e accessi → Inviti_. Il collega va invitato anche qui: gli account di DEV non passano in PROD.

**11. Controlli (spunta)**

- [ ] Login con 2FA su PROD.
- [ ] Partite, Certezze e Schedine mostrano dati.
- [ ] Un utente invitato non vede _Amministrazione_.
- [ ] Il giorno dopo: _Copia dati tra ambienti_ verde e DEV aggiornato.
- [ ] La notte dopo: _Backup_ verde, file `predictra-prod-…` su Backblaze B2.

## Dopo: come si lavora

- Si sviluppa e si prova su `dev` (DEV), come oggi.
- Quando una cosa è pronta: PR da `dev` a `main` → merge → PROD si aggiorna da solo.
- Per tornare indietro in caso di problemi: cancella la variabile `DATA_TARGET` (torna tutto su DEV) e scrivimi.
