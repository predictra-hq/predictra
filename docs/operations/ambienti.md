# Ambienti, account e credenziali

Fotografia di cosa è in servizio e di chi lo gestisce. Qui **non** vanno mai valori di segreti: solo nomi, posizioni e scadenze. Aggiorna questo file ogni volta che crei, rinnovi o elimini qualcosa.

## Ambienti

| Ambiente | App                              | Supabase                 | Vercel                                    | Branch | Stato                            |
| -------- | -------------------------------- | ------------------------ | ----------------------------------------- | ------ | -------------------------------- |
| DEV      | https://predictra-dev.vercel.app | progetto `predictra-dev` | progetto `predictra-dev` (team Predictra) | `dev`  | in servizio dal 7/11/2026        |
| PROD     | —                                | —                        | —                                         | `main` | da creare (M8, vedi setup.md §7) |

## Account

| Servizio      | Account                                                          | Note                                                                 |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| GitHub        | repository `gennpalm/predictra`, proprietario `gennpalm`         | collaboratore: `Alfry1299`. Piano Free: niente protezione dei branch |
| Supabase      | predictra.mail@gmail.com                                         | piano Free: 2 progetti attivi al massimo, nessun backup automatico   |
| Vercel        | predictra.mail@gmail.com, team **Predictra** (Hobby)             | solo uso non commerciale                                             |
| App PREDICTRA | 2 Super Admin su DEV, creati il 7/11/2026 col workflow Bootstrap | nuovi utenti solo su invito dall'area Administration                 |

## Segreti GitHub Actions

Si gestiscono in _Settings → Secrets and variables → Actions_ (solo `gennpalm`).

| Segreto                    | Usato da                         | Origine                                       |
| -------------------------- | -------------------------------- | --------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`    | deploy (migrazioni, config Auth) | token personale Supabase, con scadenza        |
| `DEV_SUPABASE_PROJECT_ID`  | deploy DEV, bootstrap            | Supabase → Project Settings                   |
| `DEV_SUPABASE_DB_PASSWORD` | deploy DEV                       | password del database DEV                     |
| `DEV_SUPABASE_SECRET_KEY`  | workflow Bootstrap Super Admin   | Supabase → API Keys → Secret key              |
| `DEV_APP_BASE_URL`         | deploy DEV, bootstrap            | `https://predictra-dev.vercel.app`            |
| `VERCEL_TOKEN`             | deploy                           | token Vercel con scope sul team, con scadenza |
| `VERCEL_ORG_ID`            | deploy                           | Team ID del team Predictra                    |
| `DEV_VERCEL_PROJECT_ID`    | deploy DEV                       | Vercel → progetto → Settings → General        |

Segreti dei provider dati (usati dal workflow _Data collector_, che scrive su Supabase con `DEV_SUPABASE_SECRET_KEY`):

| Segreto                 | Provider                                       | Stato                                          |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `FOOTBALL_DATA_API_KEY` | football-data.org (piano Free)                 | presente dal 7/11/2026                         |
| `ODDS_API_KEY`          | The Odds API (piano Starter, 500 crediti/mese) | presente dal 7/11/2026                         |
| `API_FOOTBALL_KEY`      | API-Football                                   | non creato: termini da verificare (M2 fase A3) |

## Credenziali con scadenza

Quando una di queste scade i deploy si fermano. Alla creazione o al rinnovo scrivi qui la data.

| Credenziale                               | Dove si rinnova                        | Scadenza    |
| ----------------------------------------- | -------------------------------------- | ----------- |
| Token Supabase `github-actions-predictra` | supabase.com → Account → Access Tokens | da annotare |
| Token Vercel `github-actions-predictra`   | vercel.com → Account Settings → Tokens | da annotare |

Dopo il rinnovo aggiorna il segreto GitHub con lo stesso nome e rilancia l'ultimo run della CI su `dev`.

## Workflow manuali

| Workflow              | Dove                                               | A cosa serve                                                                                                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Bootstrap Super Admin | _Actions → Bootstrap Super Admin → Run workflow_   | crea un invito SUPER_ADMIN; il link è solo nel riepilogo del run (eliminare il run dopo l'uso)                    |
| Data collector        | _Actions → Data collector → Run workflow_          | raccolta manuale da football-data.org verso DEV (opzione `dry_run` per la sola lettura); in automatico ogni 3 ore |
| Rilancio del deploy   | _Actions → CI → ultimo run su `dev` → Re-run jobs_ | ripete migrazioni, config Auth e deploy senza nuovi commit                                                        |

## Problemi già incontrati (7/11/2026, prima messa in servizio)

| Sintomo nel log                                                                                | Causa                                                                                                                                        | Soluzione                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Deploy dev saltato: Segreti mancanti: …`                                                      | segreto GitHub non inserito o con nome diverso                                                                                               | aggiungere il segreto col nome esatto e rilanciare                                                                            |
| `Error: Project not found`                                                                     | `VERCEL_ORG_ID` non è il Team ID del progetto, o token con scope sbagliato                                                                   | usare il Team ID del team Predictra e un token con scope sul team                                                             |
| `Secret values cannot be pulled` e poi `Invalid URL`                                           | variabili `NEXT_PUBLIC_*` su Vercel di tipo _Secret_                                                                                         | ricrearle di tipo _Config_; solo `SUPABASE_SECRET_KEY` resta _Secret_                                                         |
| variabili `POSTGRES_*` comparse da sole su Vercel                                              | integrazione Supabase di Vercel attivata                                                                                                     | scollegare l'integrazione: Supabase lo gestisce la pipeline                                                                   |
| _Vercel — deploy_ fermo su `Building…` fino al timeout del job (7/11/2026, dal merge della #5) | piano Hobby: Vercel blocca i deploy il cui autore git (es. `Alfry1299`) non è membro del team Predictra; la CLI resta in attesa senza errore | il deploy ora rimuove `.git` prima di `vercel deploy` (pubblicazione senza metadati git) e si ferma con errore dopo 10 minuti |
| workflow manuale assente da _Actions_ ("does not exist")                                       | il file del workflow non è sul branch di default `main`                                                                                      | merge di `dev` in `main`                                                                                                      |
