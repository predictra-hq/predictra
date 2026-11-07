# Checklist di messa in servizio — da zero

Si fa una sola volta. Per i dettagli tecnici e il funzionamento della pipeline vedi [setup.md](setup.md).

Durante la procedura tieni un blocco note **temporaneo, mai salvato nel repository**, dove annotare i valori segnati con 📝. Alla fine cancellalo.

---

## FASE A — Supabase (database e login)

### A1. Crea il progetto

1. Vai su https://supabase.com/dashboard e clicca **New project**.
2. _Name_: `predictra-dev`. _Region_: Europa, ad esempio _Central EU (Frankfurt)_.
3. _Database Password_: clicca _Generate a password_ e 📝 **copiala subito** (= `DB_PASSWORD`). Se la perdi: _Project Settings → Database → Reset database password_.
4. _Create new project_ e attendi un paio di minuti.

### A2. Recupera i valori del progetto

| Valore               | Dove si trova                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 📝 `PROJECT_ID`      | _Project Settings → General → Project ID_. È anche nell'URL: `supabase.com/dashboard/project/<PROJECT_ID>`        |
| 📝 `SUPABASE_URL`    | `https://<PROJECT_ID>.supabase.co` (visibile anche col pulsante **Connect** in alto)                              |
| 📝 `PUBLISHABLE_KEY` | _Project Settings → API Keys →_ **Publishable key** (`sb_publishable_…`)                                          |
| 📝 `SECRET_KEY`      | _Project Settings → API Keys →_ **Secret keys** → crea o rivela (`sb_secret_…`). ⚠️ Dà accesso totale al database |

Se vedi solo le chiavi "legacy": `anon` corrisponde alla publishable e `service_role` alla secret.

### A3. Crea il token per la pipeline

1. Apri https://supabase.com/dashboard/account/tokens (avatar → _Account → Access Tokens_).
2. _Generate new token_, nome `github-actions-predictra`.
3. 📝 Copialo (= `SUPABASE_ACCESS_TOKEN`). Viene mostrato una volta sola.

Su Supabase **non serve altro**: niente SQL e niente impostazioni Auth, ci pensa la pipeline.

---

## FASE B — Vercel (hosting dell'app)

### B1. Crea il progetto (scegli un'opzione)

**Opzione 1 — dal sito.** Su https://vercel.com/new importa il repository `gennpalm/predictra`. Se il repository non compare, il tuo account Vercel non ha accesso al GitHub di `gennpalm`: usa l'opzione 2.

- _Project Name_: `predictra-dev`
- _Framework Preset_: **Next.js**
- _Root Directory_: **Edit → `apps/web`**

Se il primo deploy automatico fallisce perché mancano le variabili, è normale. I deploy li farà la pipeline.

**Opzione 2 — dal PC, senza collegare GitHub.** Nella cartella del progetto:

```powershell
npx vercel@65.2.0 login
npx vercel@65.2.0 link
```

Rispondi così:

- _Link to existing project?_ **No**
- nome `predictra-dev`
- directory `./`

Poi su vercel.com apri il progetto → _Settings → Build and Deployment →_ **Root Directory** = `apps/web` → _Save_.

### B2. Variabili d'ambiente dell'app

Progetto → _Settings → Environment Variables_. Per ognuna seleziona **solo "Production"**:

| Nome                                   | Valore                                              |
| -------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | 📝 `SUPABASE_URL`                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 📝 `PUBLISHABLE_KEY`                                |
| `SUPABASE_SECRET_KEY`                  | 📝 `SECRET_KEY`, con l'opzione **Sensitive** attiva |
| `APP_BASE_URL`                         | `https://predictra-dev.vercel.app` (vedi nota)      |

> **Nota su `APP_BASE_URL`:** è l'indirizzo pubblico dell'app, senza `/` finale. Di solito è `https://<nome-progetto>.vercel.app`. Il dominio esatto si vede in _Settings → Domains_, a volte solo dopo il primo deploy. Se risulta diverso, correggilo qui e nel segreto `DEV_APP_BASE_URL` (C1).

### B3. Recupera i valori Vercel

| Valore                 | Dove si trova                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 📝 `VERCEL_PROJECT_ID` | Progetto → _Settings → General →_ **Project ID** (`prj_…`)                                                                                     |
| 📝 `VERCEL_ORG_ID`     | Account personale: avatar → _Account Settings → General →_ **Vercel ID**. Account di team: _Team Settings → General →_ **Team ID** (`team_…`)  |
| 📝 `VERCEL_TOKEN`      | Avatar → _Account Settings → Tokens → Create_. Nome `github-actions-predictra`, _Scope_ = account o team del progetto. Mostrato una sola volta |

Con l'opzione 2, Project ID e Org ID sono anche in `.vercel/project.json`, creato da `vercel link` e già escluso da git.

---

## FASE C — GitHub (collega tutto)

### C1. Segreti della pipeline

Vai su https://github.com/gennpalm/predictra → _Settings → Secrets and variables → Actions → New repository secret_. Servono i permessi di admin sul repository; se non li hai, li inserisce `gennpalm`.

| Nome segreto (esatto)      | Valore                               |
| -------------------------- | ------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`    | 📝 `SUPABASE_ACCESS_TOKEN` (A3)      |
| `DEV_SUPABASE_PROJECT_ID`  | 📝 `PROJECT_ID` (A2)                 |
| `DEV_SUPABASE_DB_PASSWORD` | 📝 `DB_PASSWORD` (A1)                |
| `DEV_APP_BASE_URL`         | stesso valore di `APP_BASE_URL` (B2) |
| `VERCEL_TOKEN`             | 📝 `VERCEL_TOKEN` (B3)               |
| `VERCEL_ORG_ID`            | 📝 `VERCEL_ORG_ID` (B3)              |
| `DEV_VERCEL_PROJECT_ID`    | 📝 `VERCEL_PROJECT_ID` (B3)          |

### C2. Primo deploy

1. Apri _Actions → CI_ → l'ultimo run su `dev` → **Re-run all jobs**.
2. Nel job **Deploy DEV** devono essere verdi:
   - _Supabase — migrazioni_
   - _Supabase — impostazioni Auth_
   - _Vercel — build_
   - _Vercel — deploy_
3. Se compare "Deploy dev saltato: segreti mancanti …", il messaggio dice quale segreto manca.
4. Apri `APP_BASE_URL`: deve comparire la pagina **Accesso riservato**.

Da qui in poi ogni push su `dev` aggiorna da solo Supabase e Vercel.

---

## FASE D — Primi Super Admin

### D1. Prepara il PC (una volta sola, serve Node.js ≥ 22)

```powershell
cd <cartella del progetto>
git pull
npm i -g pnpm@10
pnpm install
```

### D2. Crea i link di attivazione

Le variabili restano solo in questa finestra del terminale:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "<SUPABASE_URL>"
$env:SUPABASE_SECRET_KEY = "<SECRET_KEY>"
$env:APP_BASE_URL = "<APP_BASE_URL>"
node apps/web/scripts/bootstrap-super-admin.mjs prima.persona@esempio.it
node apps/web/scripts/bootstrap-super-admin.mjs seconda.persona@esempio.it
```

Ogni comando stampa un **link** valido 24 ore: consegnalo solo a quella persona. Poi chiudi il terminale.

### D3. Attivazione (ognuno per sé)

1. Apri il link e scegli nome e password (almeno 12 caratteri) → _Attiva account_.
2. _Impostazioni → Sicurezza → Attiva 2FA_.
3. Scansiona il QR con un'app di autenticazione, inserisci il codice → _Conferma_.

---

## FASE E — Verifica finale

- [ ] Logout e nuovo login: viene chiesto il codice 2FA.
- [ ] _Administration → Inviti → Crea invito_ per un `Utente`: compare il link e l'attivazione funziona.
- [ ] _Revoca_ di un invito: il link non funziona più.
- [ ] _Administration → Utenti → Link reset password_: la nuova password funziona.
- [ ] _Sospendi_ un utente: viene bloccato. _Riattiva_.
- [ ] _Administration → Audit_ mostra le azioni.

---

## FASE F — Far lavorare un collega

1. `gennpalm` lo aggiunge al repository: _Settings → Collaborators → Add people_.
2. Il collega clona il repository, fa `git checkout dev` e `pnpm install`, poi apre Claude Code nella cartella. Claude legge da solo [CLAUDE.md](../../CLAUDE.md), che contiene regole, struttura e prossimo passo.
3. Non gli servono le chiavi di Supabase o di Vercel: pubblica facendo push su `dev` e la pipeline fa il resto.

---

**Alla fine:** cancella il blocco note con le chiavi. I valori restano solo su Vercel e su GitHub Secrets.

**Se qualcosa va storto:** condividi il log del passo fallito (il testo del job su GitHub Actions). Mai chiavi, token o password.
