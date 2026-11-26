# ADR 0075 — Segreti e dati con il repository pubblico

- **Stato:** accettato (26/11/2026); i passi nelle impostazioni di GitHub restano da fare al proprietario (§ «Passi del proprietario»)
- **Milestone:** M8 (sicurezza)
- **Aggiorna:** ADR 0068 (repository pubblico), ADR 0050 (deploy dei soli commit del proprietario), ADR 0040 (backup)

## Contesto

Dal 24/11/2026 il repository è pubblico (ADR 0068). La revisione di sicurezza del 26/11/2026 ha trovato quattro punti in cui i workflow rendevano pubblici dati che prima erano visibili solo a chi aveva accesso al repository:

1. **Bootstrap Super Admin** scriveva il link di attivazione nel riepilogo del run. Il riepilogo di un repository pubblico lo legge chiunque: chi apre il link per primo imposta la password e la 2FA e diventa Super Admin, anche su PROD. Anche l'email inserita compare nei log.
2. **Backup** caricava il dump cifrato come artifact per 7 giorni. Gli artifact di un repository pubblico si scaricano con qualunque account GitHub. Il dump contiene anche lo schema `auth` (email, hash delle password, segreti TOTP). L'unica protezione era la passphrase.
3. **Verifica DEV** salvava come artifact gli screenshot di `/admin/users` (email degli utenti), della Home e dello Spogliatoio, e stampava nel log il testo e le immagini delle pagine. DEV è una copia dei dati di PROD (ADR 0055) e `accessibility-prod` gira sul sito in servizio.
4. **Tutti i segreti sono a livello di repository.** Chiunque possa fare push crea un branch con un workflow che li legge. I controlli su `github.actor` o sul branch stanno nello stesso file che verrebbe riscritto.

## Decisione

1. **Bootstrap:** con repository pubblico il job che crea l'invito non parte e un secondo job, senza variabili d'ambiente, spiega come crearlo in locale ([setup.md](../operations/setup.md) §5). Torna a funzionare da solo se il repository torna privato.
2. **Backup:** nessuna copia come artifact. La copia resta su B2, cifrata, con rotazione (ADR 0040).
3. **Verifica DEV:** screenshot, testo e immagini delle pagine solo con repository privato, e mai per `accessibility-prod`. `/admin/users` non si fotografa più in nessun caso. Le verifiche axe restano uguali.
4. **Environments:**
   - `operazioni` per tutti i job che usano segreti (agente, raccolte, previsioni, proposte, backup, copia dei dati, Verifica DEV, bootstrap, preparazione di Vercel PROD), solo dai branch `dev` e `main`;
   - `dev` e `prod` per il deploy (`deploy-target.yml`), rispettivamente solo da `dev` e da `main`. In un workflow riutilizzabile il segreto dell'Environment prevale su quello passato dal chiamante, quindi `ci.yml` non cambia.

   Finché gli Environments non hanno segreti valgono quelli del repository: la modifica non ferma nulla. Nessun job con un Environment gira sulle pull request.

5. **CODEOWNERS:** `.github/`, `supabase/`, `scripts/backup/` e `scripts/sync/` richiedono la revisione di `gennpalm` quando la regola dei branch lo chiede.
6. **Dependabot** per le azioni dei workflow: una PR alla settimana verso `dev`. Le PR di Dependabot girano senza i segreti del progetto.
7. **Protezione dei branch:** con il repository pubblico è disponibile sul piano Free. Sostituisce il flusso solo manuale dell'ADR 0050 finché il repository resta pubblico.

## Passi del proprietario

In quest'ordine, per non fermare PROD:

1. **Subito, prima di tutto il resto:** cancellare i run che hanno esposto dati (_Actions_ → run → ⋯ → _Delete workflow run_; cancellare il run toglie anche log e artifact):
   - tutti i run di _Bootstrap Super Admin_;
   - i run di _Backup_ ancora con l'artifact (quelli degli ultimi 7 giorni);
   - i run di _Verifica DEV_ con `accessibility` o `accessibility-prod`.
2. **Passphrase dei backup:** se non è casuale e lunga almeno 20 caratteri, cambiarla (`BACKUP_PASSPHRASE`) e farne una copia fuori da GitHub. I backup già su B2 restano leggibili con quella vecchia, che va conservata finché non scadono (12 mesi).
3. **Merge in `dev` e poi in `main`** di questa modifica: schedule e avvii manuali usano i file di `main`.
4. **Environments** (_Settings → Environments_), ognuno con _Deployment branches and tags → Selected branches_:

   | Environment  | Branch        | Segreti (stessi valori di oggi)                                                                                                                                                                                                                                                                                                                                                                                                                    |
   | ------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `operazioni` | `dev`, `main` | `SUPABASE_ACCESS_TOKEN`, `DEV_SUPABASE_PROJECT_ID`, `DEV_SUPABASE_SECRET_KEY`, `DEV_SUPABASE_DB_PASSWORD`, `DEV_APP_BASE_URL`, `PROD_SUPABASE_PROJECT_ID`, `PROD_SUPABASE_SECRET_KEY`, `PROD_SUPABASE_DB_PASSWORD`, `PROD_APP_BASE_URL`, `FOOTBALL_DATA_API_KEY`, `ODDS_API_KEY`, `API_FOOTBALL_KEY`, `BACKUP_PASSPHRASE`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_ENDPOINT`, `B2_BUCKET`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `DEV_VERCEL_PROJECT_ID` |
   | `dev`        | `dev`         | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` (= DEV), `SUPABASE_DB_PASSWORD` (= DEV), `APP_BASE_URL` (= DEV), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (= DEV)                                                                                                                                                                                                                                                                       |
   | `prod`       | `main`        | gli stessi nomi di `dev`, con i valori di PROD                                                                                                                                                                                                                                                                                                                                                                                                     |

   Nessun revisore obbligatorio: l'agente parte da solo da QStash e si fermerebbe in attesa di un'approvazione.

5. **Prova** prima di cancellare qualcosa: un push su `dev` (deploy DEV verde), _Agent (Python)_ avviato a mano da `main`, _Verifica DEV_ → `bankroll-isolation` da `dev`.
6. **Cancellare i segreti del repository** (_Settings → Secrets and variables → Actions → Repository secrets_). Le variabili (`DATA_TARGET`, `GITHUB_DISPATCH_REF`…) restano dove sono. Ripetere la prova del punto 5.
7. **Regole dei branch** (_Settings → Rules → Rulesets_), un ruleset per `dev` e `main`:
   - blocco di force push e cancellazione;
   - controllo obbligatorio «Lint, typecheck, test, build»;
   - su `main` solo tramite pull request, con _merge commit_ (ADR 0050);
   - revisione dei code owner obbligatoria;
   - `gennpalm` (ruolo Admin del repository) nella lista di bypass, perché lavora direttamente su `dev`.
8. **Impostazioni gratuite dei repository pubblici:**
   - _Settings → Actions → General_: _Require approval for all external contributors_ (lo chiedeva già l'ADR 0068) e _Workflow permissions_ in sola lettura;
   - _Settings → Code security_: _Secret scanning_ con _Push protection_, _Private vulnerability reporting_, _Dependabot alerts_.

## Conseguenze

- Il primo Super Admin di un ambiente nuovo si crea in locale finché il repository è pubblico.
- Non c'è più una seconda copia dei backup fuori da B2 per gli ultimi 7 giorni. Se la chiave B2 trapela, i backup si possono cancellare (Object Lock non disponibile): da valutare un secondo bucket gratuito con una chiave diversa.
- Gli screenshot della Verifica DEV non ci sono più. Per vederli si avvia l'app in locale con `SCREENSHOT_DIR`.
- Verifica DEV e gli avvii manuali dei motori partono solo da `dev` o da `main`, non più da un branch di lavoro.
- Se il repository torna privato, sul piano Free decadono sia le regole dei branch sia gli Environments (per i repository privati servono GitHub Pro o Team): va rivisto questo ADR. Bootstrap e screenshot tornano invece a funzionare da soli.
- Limite non risolto a €0: chi ha permesso di scrittura e riesce a fare push su `dev` (per esempio con un account rubato) legge ancora i segreti di `operazioni`. Le regole dei branch lo impediscono a chi non è nella lista di bypass.
