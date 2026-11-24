# Ambienti, account e credenziali

Fotografia di cosa è in servizio e di chi lo gestisce. Qui **non** vanno mai valori di segreti: solo nomi, posizioni e scadenze. Aggiorna questo file ogni volta che crei, rinnovi o elimini qualcosa.

## Ambienti

| Ambiente | App                               | Supabase                    | Vercel                                            | Branch | Stato                                                                                                                                                                                                                 |
| -------- | --------------------------------- | --------------------------- | ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV      | https://predictra-dev.vercel.app  | progetto `predictra-dev`    | progetto `predictra-dev` (team Predictra)         | `dev`  | in servizio dal 7/11/2026                                                                                                                                                                                             |
| PROD     | https://predictra-prod.vercel.app | `predictra-prod` (Supabase) | `predictra-prod` (Vercel, senza collegamento Git) | `main` | in servizio dal 17/11/2026; unica a raccogliere dati (`DATA_TARGET=prod`), DEV ne riceve una copia ogni giorno ([ADR 0055](../decisions/0055-una-sola-raccolta-prod-copia-su-dev.md), [produzione.md](produzione.md)) |

## Regioni dei servizi

Obiettivo: app e dati in Europa, vicino agli utenti e al database. Aggiornato al 9/11/2026.

| Servizio                       | Regione                                                                  | Dove si imposta                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Vercel: funzioni dell'app      | **`fra1` (Francoforte)** dal 9/11/2026 (prima `iad1`, Washington)        | `apps/web/vercel.json` (`regions`) e Vercel → progetto → Settings → Functions; devono coincidere     |
| Vercel: rete di distribuzione  | il nodo più vicino a chi si collega (in Europa per gli utenti in Italia) | non si imposta: è la prima parte dell'header `x-vercel-id`                                           |
| Supabase DEV (database e Auth) | **Francoforte (`eu-central-1`)**, confermato da `gennpalm` il 9/11/2026  | alla creazione del progetto: non si cambia senza crearne uno nuovo                                   |
| Upstash QStash                 | EU (`qstash.upstash.io`)                                                 | console Upstash; chiavi e schedule sono per regione                                                  |
| GitHub Actions (worker e CI)   | runner ospitati da GitHub, non sceglibili sul piano gratuito             | eseguono solo i job programmati e la CI; non servono le pagine agli utenti                           |
| Backblaze B2 (backup cifrati)  | `us-east-005` (Stati Uniti), ADR 0040                                    | per l'Europa: account Backblaze nuovo con regione europea e segreti `B2_*` aggiornati (decisione M8) |

Verifica della regione delle funzioni: `curl -sI https://predictra-dev.vercel.app/login | grep -i x-vercel-id` → la seconda parte (es. `…::fra1::…`) è la regione della funzione.

## Account

| Servizio      | Account                                                                                                                                                                           | Note                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub        | repository `predictra-hq/predictra` (organizzazione Free, proprietario `gennpalm`; spostato il 15/11/2026 da `gennpalm/predictra` per avere una quota di minuti Actions separata) | collaboratore: `Alfry1299`. Piano Free: niente protezione dei branch. Impostazioni: merge solo da `gennpalm` (ADR 0050), _Automatically delete head branches_ attivo            |
| Supabase      | account Google del progetto (indirizzo nel gestore delle password)                                                                                                                | piano Free: 2 progetti attivi al massimo, nessun backup automatico                                                                                                              |
| Vercel        | account Google del progetto (indirizzo nel gestore delle password), team **Predictra** (Hobby)                                                                                    | solo uso non commerciale. Con il repository privato si pubblicano solo commit del proprietario (ADR 0050); con il repository pubblico anche quelli dei collaboratori (ADR 0068) |
| App PREDICTRA | 2 Super Admin su DEV, creati il 7/11/2026 col workflow Bootstrap                                                                                                                  | nuovi utenti solo su invito dall'area Administration                                                                                                                            |

## Segreti GitHub Actions

Si gestiscono in _Settings → Secrets and variables → Actions_ (solo `gennpalm`).

| Segreto                    | Usato da                         | Origine                                         |
| -------------------------- | -------------------------------- | ----------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`    | deploy (migrazioni, config Auth) | token personale Supabase, senza scadenza        |
| `DEV_SUPABASE_PROJECT_ID`  | deploy DEV, bootstrap            | Supabase → Project Settings                     |
| `DEV_SUPABASE_DB_PASSWORD` | deploy DEV                       | password del database DEV                       |
| `DEV_SUPABASE_SECRET_KEY`  | workflow Bootstrap Super Admin   | Supabase → API Keys → Secret key                |
| `DEV_APP_BASE_URL`         | deploy DEV, bootstrap            | `https://predictra-dev.vercel.app`              |
| `VERCEL_TOKEN`             | deploy                           | token Vercel con scope sul team, senza scadenza |
| `VERCEL_ORG_ID`            | deploy                           | Team ID del team Predictra                      |
| `DEV_VERCEL_PROJECT_ID`    | deploy DEV                       | Vercel → progetto → Settings → General          |

Segreti dei provider dati (usati dal workflow _Data collector_, che scrive su Supabase con `DEV_SUPABASE_SECRET_KEY`):

| Segreto                                                                            | Provider                                                       | Stato                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `FOOTBALL_DATA_API_KEY`                                                            | football-data.org (piano Free)                                 | presente dal 7/11/2026                                |
| `ODDS_API_KEY`                                                                     | The Odds API (piano Starter, 500 crediti/mese)                 | presente dal 7/11/2026                                |
| `BACKUP_PASSPHRASE`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT` | Backblaze B2, backup cifrati (ADR 0040, regione `us-east-005`) | presenti dall'8/11/2026                               |
| `API_FOOTBALL_KEY`                                                                 | API-Football                                                   | presente dall'11/11/2026 (account registrato l'11/11) |

## Credenziali da rinnovare

I due token usati dai deploy (verificato dal proprietario l'8/11/2026) e il token dell'avvio di riserva dell'agente (11/11/2026) sono stati creati **senza scadenza**. Vanno sostituiti solo se vengono revocati o compromessi: in quel caso i deploy si fermano con un errore di autenticazione. Se un giorno ne crei uno con scadenza, scrivi qui la data.

| Credenziale                                                                   | Dove si rinnova                                                                                                     | Scadenza                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token Supabase `github-actions-predictra`                                     | supabase.com → Account → Access Tokens                                                                              | nessuna                                                                                                                                                       |
| Token Vercel `github-actions-predictra`                                       | vercel.com → Account Settings → Tokens                                                                              | nessuna                                                                                                                                                       |
| Token GitHub `predictra-agent-dispatch` (Vercel DEV, `GITHUB_DISPATCH_TOKEN`) | github.com → Settings → Developer settings → Fine-grained tokens; poi Vercel → Environment Variables e nuovo deploy | nessuna (verificato dal proprietario l'11/11/2026). Se viene revocato, l'avvio di riserva risponde `failed` e i cicli dipendono solo dallo schedule di GitHub |

Dopo la sostituzione aggiorna il segreto GitHub con lo stesso nome e rilancia l'ultimo run della CI su `dev`.

## Workflow manuali

| Workflow              | Dove                                               | A cosa serve                                                                                                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Bootstrap Super Admin | _Actions → Bootstrap Super Admin → Run workflow_   | crea un invito SUPER_ADMIN; il link è solo nel riepilogo del run (eliminare il run dopo l'uso)                    |
| Data collector        | _Actions → Data collector → Run workflow_          | raccolta manuale da football-data.org verso DEV (opzione `dry_run` per la sola lettura); in automatico ogni 3 ore |
| Rilancio del deploy   | _Actions → CI → ultimo run su `dev` → Re-run jobs_ | ripete migrazioni, config Auth e deploy senza nuovi commit                                                        |

## Problemi già incontrati (7/11/2026, prima messa in servizio)

| Sintomo nel log                                                                                | Causa                                                                                                                               | Soluzione                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deploy dev saltato: Segreti mancanti: …`                                                      | segreto GitHub non inserito o con nome diverso                                                                                      | aggiungere il segreto col nome esatto e rilanciare                                                                                                                                                                                                                           |
| `Error: Project not found`                                                                     | `VERCEL_ORG_ID` non è il Team ID del progetto, o token con scope sbagliato                                                          | usare il Team ID del team Predictra e un token con scope sul team                                                                                                                                                                                                            |
| `Secret values cannot be pulled` e poi `Invalid URL`                                           | variabili `NEXT_PUBLIC_*` su Vercel di tipo _Secret_                                                                                | ricrearle di tipo _Config_; solo `SUPABASE_SECRET_KEY` resta _Secret_                                                                                                                                                                                                        |
| variabili `POSTGRES_*` comparse da sole su Vercel                                              | integrazione Supabase di Vercel attivata                                                                                            | scollegare l'integrazione: Supabase lo gestisce la pipeline                                                                                                                                                                                                                  |
| _Vercel — deploy_ fermo su `Building…` fino al timeout del job (7/11/2026, dal merge della #5) | piano Hobby: Vercel rifiuta i deploy il cui autore git non è il proprietario (qui `Alfry1299`); la CLI resta in attesa senza errore | merge su `dev` e `main` solo da `gennpalm` con _Create a merge commit_; il deploy controlla l'autore e, se non è il proprietario, si ferma subito con un errore chiaro (ADR 0050). La rimozione di `.git` usata il 7/11 aggirava il limite del piano ed è stata tolta l'8/11 |
| workflow manuale assente da _Actions_ ("does not exist")                                       | il file del workflow non è sul branch di default `main`                                                                             | merge di `dev` in `main`                                                                                                                                                                                                                                                     |
