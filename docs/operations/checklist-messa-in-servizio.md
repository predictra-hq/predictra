# Checklist di messa in servizio — da zero

Si fa una sola volta, **tutta dal browser**: niente da installare né da eseguire sul proprio computer. Per i dettagli tecnici e il funzionamento della pipeline vedi [setup.md](setup.md).

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
2. _Generate new token_, nome `github-actions-predictra`:
   - _Expires in_: la durata **più lunga** disponibile (la pipeline lo usa a ogni deploy: alla scadenza i deploy si fermano). Segna in calendario quando rinnovarlo;
   - _Resource access_: **Project** → organizzazione e progetto `predictra-dev` (aggiungi `predictra-prod` quando esisterà);
   - _Permissions_: lettura del progetto, scrittura su **Database** (migrazioni) e su **Application services / Auth** (impostazioni Auth). Se il passo _Supabase — migrazioni_ fallisce per permessi, usa _Create legacy token_.
3. 📝 Copialo (= `SUPABASE_ACCESS_TOKEN`). Viene mostrato una volta sola.

Su Supabase **non serve altro**: niente SQL e niente impostazioni Auth, ci pensa la pipeline.

---

## FASE B — Vercel (hosting dell'app)

### B1. Crea il progetto

Su https://vercel.com/new importa il repository `gennpalm/predictra`. Se il repository non compare, autorizza l'app Vercel sull'account GitHub `gennpalm` (_Adjust GitHub App Permissions_).

- _Vercel Team_: il team del progetto (es. **Predictra**)
- _Project Name_: `predictra-dev`
- _Framework Preset_: **Next.js**
- _Root Directory_: **Edit → `apps/web`**

⚠️ **Non attivare integrazioni** (sezione _Optional Integrations_, in particolare **Supabase**): aggiungono variabili `POSTGRES_*` e `NEXT_PUBLIC_SUPABASE_*` di tipo _Secret_ che rompono la build. Supabase lo collega già la pipeline.

Se il primo deploy automatico fallisce perché mancano le variabili, è normale. I deploy li farà la pipeline.

### B2. Variabili d'ambiente dell'app

Progetto → _Settings → Environment Variables_ → _Add Environment Variable_. Per ognuna seleziona **solo "Production"** e il _Type_ indicato:

| Nome                                   | Tipo       | Valore                                         |
| -------------------------------------- | ---------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | **Config** | 📝 `SUPABASE_URL`                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Config** | 📝 `PUBLISHABLE_KEY`                           |
| `SUPABASE_SECRET_KEY`                  | **Secret** | 📝 `SECRET_KEY`                                |
| `APP_BASE_URL`                         | **Config** | `https://predictra-dev.vercel.app` (vedi nota) |

> **Config o Secret?** Le variabili _Secret_ non sono leggibili dalla pipeline, che fa la build su GitHub Actions: se `NEXT_PUBLIC_SUPABASE_URL` è _Secret_ la build fallisce con "Invalid URL". Le tre variabili _Config_ sono pubbliche per natura (finiscono nel browser). Un tipo già salvato non si cambia: elimina la variabile e ricreala.

> **Nota su `APP_BASE_URL`:** è l'indirizzo pubblico dell'app, senza `/` finale. Di solito è `https://<nome-progetto>.vercel.app`. Il dominio esatto si vede in _Settings → Domains_, a volte solo dopo il primo deploy. Se risulta diverso, correggilo qui e nel segreto `DEV_APP_BASE_URL` (C1).

### B3. Recupera i valori Vercel

| Valore                 | Dove si trova                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📝 `VERCEL_PROJECT_ID` | Progetto → _Settings → General →_ **Project ID** (`prj_…`)                                                                                                     |
| 📝 `VERCEL_ORG_ID`     | Team del progetto → _Settings → General →_ **Team ID** (`team_…`). Solo se il progetto è su un account personale: _Account Settings → General →_ **Vercel ID** |
| 📝 `VERCEL_TOKEN`      | Avatar → _Account Settings → Tokens → Create_. Nome `github-actions-predictra`, _Scope_ = **il team del progetto**, scadenza lunga. Mostrato una sola volta    |

Se `VERCEL_ORG_ID` o lo scope del token non corrispondono al team del progetto, il deploy fallisce con "Project not found".

---

## FASE C — GitHub (collega tutto)

### C1. Segreti della pipeline

Vai su https://github.com/gennpalm/predictra → _Settings → Secrets and variables → Actions → New repository secret_. Servono i permessi di admin sul repository; se non li hai, li inserisce `gennpalm`.

| Nome segreto (esatto)      | Valore                               |
| -------------------------- | ------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`    | 📝 `SUPABASE_ACCESS_TOKEN` (A3)      |
| `DEV_SUPABASE_PROJECT_ID`  | 📝 `PROJECT_ID` (A2)                 |
| `DEV_SUPABASE_DB_PASSWORD` | 📝 `DB_PASSWORD` (A1)                |
| `DEV_SUPABASE_SECRET_KEY`  | 📝 `SECRET_KEY` (A2)                 |
| `DEV_APP_BASE_URL`         | stesso valore di `APP_BASE_URL` (B2) |
| `VERCEL_TOKEN`             | 📝 `VERCEL_TOKEN` (B3)               |
| `VERCEL_ORG_ID`            | 📝 `VERCEL_ORG_ID` (B3)              |
| `DEV_VERCEL_PROJECT_ID`    | 📝 `VERCEL_PROJECT_ID` (B3)          |

Sono **8**: controlla che la lista li mostri tutti, con i nomi identici. `DEV_SUPABASE_SECRET_KEY` serve solo al workflow dei Super Admin (FASE D).

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

### D1. Crea i link di attivazione (solo `gennpalm`)

Lo fa il workflow **Bootstrap Super Admin**, su GitHub Actions: nessuna chiave da copiare, nessun comando da eseguire.

1. Su GitHub: _Actions → Bootstrap Super Admin → Run workflow_.
2. _Use workflow from_: `main` · _Ambiente_: `dev` · _Email del Super Admin_: l'email della persona → **Run workflow**.
3. Ripeti per la seconda persona.
4. Apri ogni run concluso: il **link di attivazione** è nel riquadro _Summary_ (non nei log). Vale 24 ore, è monouso: consegnalo solo a quella persona.

Note:

- il workflow lo può avviare solo il proprietario del repository;
- compare in _Actions_ solo se il file `.github/workflows/bootstrap-super-admin.yml` è sul branch di default (`main`);
- se esiste già un invito attivo per quell'email, il workflow si ferma senza fare nulla.

### D2. Attivazione (ognuno per sé)

1. Apri il link e scegli nome e password (almeno 12 caratteri) → _Attiva account_.
2. _Impostazioni → Sicurezza → Attiva 2FA_.
3. Scansiona il QR con un'app di autenticazione, inserisci il codice → _Conferma_.
4. Quando entrambi hanno attivato l'account, `gennpalm` elimina i due run del workflow (menu ⋯ → _Delete workflow run_), così i link non restano su GitHub.

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
2. Il collega lavora da **Claude Code sul web** (claude.ai/code) collegato al repository, sul branch `dev`; in alternativa clona il repository in locale. Claude legge da solo [CLAUDE.md](../../CLAUDE.md), che contiene regole, struttura e prossimo passo.
3. Non gli servono le chiavi di Supabase o di Vercel: pubblica facendo push su `dev` e la pipeline fa il resto.

---

**Alla fine:** cancella il blocco note con le chiavi. I valori restano solo su Vercel e su GitHub Secrets.

**Se qualcosa va storto:** condividi il log del passo fallito (il testo del job su GitHub Actions). Mai chiavi, token o password.
