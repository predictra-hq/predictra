# Guida di messa in servizio — PREDICTRA

> Procedura passo-passo con indicazione di dove recuperare ogni valore: [checklist-messa-in-servizio.md](checklist-messa-in-servizio.md).

Questa guida porta da zero a un ambiente **DEV** funzionante e aggiornato in automatico a ogni push.
Account, chiavi e impostazioni cloud li crea **il proprietario del progetto**: nessuna chiave va scritta nel repository, in chat o in un file versionato.

## Come funziona

```text
git push su dev
   └─ GitHub Actions "CI"
        ├─ checks:   format, lint, typecheck, test (migrazioni + RLS), build, audit
        ├─ secrets:  scansione segreti (gitleaks)
        └─ deploy-dev (solo se i due job sopra sono verdi)
             1. supabase db push      → applica le nuove migrazioni SQL   (nessun SQL a mano)
             2. supabase config push  → applica le impostazioni Auth di supabase/config.toml
             3. vercel build + deploy → pubblica l'app sul progetto Vercel DEV
```

| Branch | Supabase          | Vercel                                               | Stato                                                   |
| ------ | ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `dev`  | progetto **DEV**  | progetto **DEV** (deploy di produzione del progetto) | da attivare ora                                         |
| `main` | progetto **PROD** | progetto **PROD**                                    | saltato in automatico finché mancano i segreti `PROD_*` |

**PREDICTRA non invia email.** Inviti e reset password generano un link personale che l'amministratore copia e consegna a mano (es. dal gestionale). Il link vale 24 ore ed è monouso.

---

## 1. Supabase — progetto DEV

1. Crea il progetto (es. `predictra-dev`), regione UE (es. Frankfurt). **Annota la password del database** scelta in creazione.
2. Da _Project Settings_ annota:
   - **Project ID / Reference** (es. `abcd1234efgh5678ijkl`);
   - **Project URL** (`https://<ref>.supabase.co`);
   - in _API Keys_: la chiave **publishable** (`sb_publishable_…`) e la chiave **secret** (`sb_secret_…`). Sui progetti legacy sono "anon" e "service_role".
3. Crea un **Access Token** personale: avatar in alto a destra → _Account_ → _Access Tokens_ → _Generate new token_ (nome: `github-actions-predictra`).

Non serve eseguire SQL né cambiare impostazioni Auth a mano: lo fa la pipeline. Serve una sola eccezione, al passo 1: la password del database.

## 2. Vercel — progetto DEV

1. Crea il progetto (es. `predictra-dev`) importando il repository GitHub `gennpalm/predictra`:
   - _Framework Preset_: **Next.js**;
   - _Root Directory_: **`apps/web`**.

   I deploy automatici di Vercel al push sono disattivati da `apps/web/vercel.json`: i deploy li fa la pipeline, dopo i controlli e le migrazioni. Non attivare l'integrazione Supabase di Vercel: le sue variabili _Secret_ rompono la build.

2. _Settings → Environment Variables_, ambiente **Production**:

   | Nome                                   | Tipo   | Valore                                                                          |
   | -------------------------------------- | ------ | ------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Config | Project URL di Supabase                                                         |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | chiave publishable                                                              |
   | `SUPABASE_SECRET_KEY`                  | Secret | chiave secret (**mai** con prefisso `NEXT_PUBLIC_`)                             |
   | `APP_BASE_URL`                         | Config | dominio del progetto, es. `https://predictra-dev.vercel.app` (senza `/` finale) |
   | `GROQ_API_KEY`                         | Secret | chiave Groq di Ask PREDICTRA (ADR 0042); senza, la chat resta spenta            |
   | `ASK_ENABLED`                          | Config | facoltativa: `false` spegne Ask anche con la chiave presente                    |
   | `GROQ_MODEL`                           | Config | facoltativa: modello Groq, predefinito `openai/gpt-oss-120b`                    |

   La pipeline scarica le variabili con `vercel pull` e fa la build su GitHub Actions: le variabili di tipo _Secret_ arrivano come `[SENSITIVE]`. Per questo quelle usate in build (`NEXT_PUBLIC_*`) devono essere _Config_. `SUPABASE_SECRET_KEY` serve solo a runtime, sui server Vercel, e resta _Secret_.

3. Annota:
   - **Project ID**: _Settings → General → Project ID_ (`prj_…`);
   - **Team ID**: _Team Settings → General_ → _Team ID_ (`team_…`); solo per un account personale, _Account Settings → General_ → _Vercel ID_;
   - **Token**: _Account Settings → Tokens → Create_ (nome: `github-actions-predictra`, scope = il team del progetto).

## 3. GitHub — segreti della pipeline

Repository → _Settings → Secrets and variables → Actions → New repository secret_:

| Segreto                    | Valore                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`    | access token Supabase (passo 1.3)                                  |
| `DEV_SUPABASE_PROJECT_ID`  | Project ID/Reference Supabase DEV                                  |
| `DEV_SUPABASE_DB_PASSWORD` | password del database DEV                                          |
| `DEV_SUPABASE_SECRET_KEY`  | chiave secret Supabase DEV (solo per il bootstrap dei Super Admin) |
| `DEV_APP_BASE_URL`         | lo stesso `APP_BASE_URL` di Vercel DEV                             |
| `VERCEL_TOKEN`             | token Vercel                                                       |
| `VERCEL_ORG_ID`            | Team ID Vercel                                                     |
| `DEV_VERCEL_PROJECT_ID`    | Project ID Vercel DEV                                              |

Con GitHub Free sui repository privati gli _Environments_ non sono disponibili: per questo i segreti usano i prefissi `DEV_` e `PROD_`.

## 4. Primo deploy

Avvia la pipeline in uno di due modi:

- fai un push su `dev`;
- apri _Actions → CI_ → l'ultimo run su `dev` → _Re-run all jobs_.

Nel job **Deploy DEV** devono risultare verdi:

1. _Supabase — migrazioni_: crea tabelle, RLS e funzioni.
2. _Supabase — impostazioni Auth_: registrazione pubblica disattivata, password minima di 12 caratteri, 2FA TOTP attiva, link validi 24 h, Site URL.
3. _Vercel — build_ e _Vercel — deploy_.

Se mancano dei segreti, il deploy viene **saltato** con un avviso che li elenca.

## 5. Primi Super Admin (una volta sola)

Il primo accesso non può nascere da un invito in app. Lo crea il workflow **Bootstrap Super Admin** (`.github/workflows/bootstrap-super-admin.yml`), avviabile solo dal proprietario del repository:

1. _Actions → Bootstrap Super Admin → Run workflow_ → ambiente `dev` ed email della persona;
2. il run esegue `apps/web/scripts/bootstrap-super-admin.mjs` con i segreti `DEV_SUPABASE_PROJECT_ID`, `DEV_SUPABASE_SECRET_KEY` e `DEV_APP_BASE_URL`;
3. il **link di attivazione** compare solo nel riepilogo (_Summary_) del run, mai nel log. Consegnalo solo a quella persona, che poi:
   1. apre il link → _Attiva account_ (nome e password, minimo 12 caratteri);
   2. va in _Impostazioni → Sicurezza_ → attiva la **2FA** (obbligatoria per l'area Administration);
4. dopo l'attivazione elimina il run (menu ⋯ → _Delete workflow run_).

I workflow ad avvio manuale compaiono in _Actions_ solo se il file è sul branch di default (`main`).

## 6. Uso quotidiano degli account (nessuna email)

| Operazione              | Dove                                            | Note                                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Invitare un utente      | _Administration → Inviti → Crea invito_         | appare un link da copiare e consegnare; scade in 24 h |
| Annullare un invito     | _Inviti → Revoca_                               | il link smette di funzionare                          |
| Password dimenticata    | _Administration → Utenti → Link reset password_ | link da consegnare; vale 24 h                         |
| Sospendere / riattivare | _Utenti → Sospendi / Riattiva_                  | la sospensione blocca subito l'accesso                |
| Cambiare ruolo          | _Utenti → Applica ruolo_                        | un Admin gestisce solo utenti `USER`                  |
| Storico azioni          | _Administration → Audit_                        | registro non modificabile                             |

Se un invito scade (24 h) senza essere usato: _Revoca_ e poi _Crea invito_ di nuovo.

## 7. Produzione (più avanti)

Quando servirà l'ambiente PROD:

1. ripeti i passi 1 e 2 con un nuovo progetto Supabase e un nuovo progetto Vercel (es. `predictra-prod`);
2. aggiungi i segreti `PROD_SUPABASE_PROJECT_ID`, `PROD_SUPABASE_DB_PASSWORD`, `PROD_SUPABASE_SECRET_KEY`, `PROD_APP_BASE_URL` e `PROD_VERCEL_PROJECT_ID` (e lo scope del token Supabase sul nuovo progetto);
3. fai il merge di `dev` in `main` (tramite Pull Request): il job _Deploy PROD_ parte da solo;
4. esegui il workflow **Bootstrap Super Admin** con ambiente `prod`.

## 8. Protezione dei branch

Su **GitHub Free** i repository **privati** non hanno la protezione dei branch (disponibile con GitHub Pro/Team). Fonte: https://docs.github.com/en/get-started/learning-about-github/githubs-plans.

Senza protezione restano comunque questi controlli:

- il deploy parte **solo** se lint, typecheck, test, build e scansione segreti sono verdi;
- le migrazioni sono testate in CI prima di arrivare su Supabase.

Regola di lavoro concordata: ogni modifica arriva su `dev` tramite Pull Request da un branch `feature/*`, e `main` riceve solo merge da `dev`. I merge li fa `gennpalm` con _Create a merge commit_ (ADR 0050). GitHub cancella il branch dopo il merge (_Settings → General → Automatically delete head branches_): i branch `feature/*` che restano sono lavoro non ancora unito.

Per la protezione vera il proprietario del repo (`gennpalm`) può passare a GitHub Pro. Poi: _Settings → Branches → Add rule_ per `main` e `dev`, con PR obbligatoria e check obbligatori "Lint, typecheck, test, build" e "Scansione segreti".

## 9. Verifica finale (manuale)

- [ ] Job _Deploy DEV_ verde su GitHub Actions.
- [ ] `APP_BASE_URL` apre la pagina di login.
- [ ] Super Admin: attivazione da link, attivazione 2FA, logout e nuovo login con codice.
- [ ] Invito di un `USER` → link → attivazione → l'utente non vede _Administration_.
- [ ] Revoca di un invito: il link non funziona più.
- [ ] Link reset password generato da un Super Admin → nuova password funzionante.
- [ ] Sospensione: l'utente viene bloccato. Riattivazione.
- [ ] _Administration → Audit_ mostra le azioni.

## Sviluppo locale (facoltativo, non necessario)

Tutto il ciclo (controlli, migrazioni, deploy, Super Admin) gira in cloud. In locale servono Node.js ≥ 22 e pnpm 10:

```bash
pnpm install
pnpm check
pnpm dev
```

`pnpm check` esegue tutti i controlli. Per `pnpm dev` serve `apps/web/.env.local` creato da `.env.example` con i valori DEV.
