# Runbook operativo (M8, fase B2)

Cosa fare quando qualcosa si ferma. Ogni voce dice **come accorgersene**, **cosa fare** e **dove sono i dettagli**. Tutto si fa dal browser (GitHub, Vercel, Supabase): niente da eseguire sul proprio computer. Gli ambienti, gli account e i segreti sono in [ambienti.md](ambienti.md).

Regola generale: mai incollare chiavi, token o password in issue, PR, log o chat. Per chiedere aiuto si condivide solo il testo del passo fallito.

## 1. Deploy

**Come funziona.** Push su `dev` con CI verde → _Deploy DEV_ (migrazioni Supabase, impostazioni Auth, build e deploy su Vercel). Merge di `dev` in `main` → _Deploy PROD_, quando esistono i segreti `PROD_*`. Dettagli: [setup.md](setup.md).

**Il deploy non parte o fallisce.**

1. _Actions → CI_ → apri il run: il passo rosso dice la causa.
2. "Deploy saltato: segreti mancanti": aggiungi il segreto indicato (_Settings → Secrets and variables → Actions_).
3. _Vercel — deploy_ fermo su `Building…`: il commit non è del proprietario. Il merge va fatto da `gennpalm` con **Create a merge commit** ([ADR 0050](../decisions/0050-deploy-solo-commit-del-proprietario.md)).
4. _Supabase — migrazioni_ fallito: una migrazione ha un timestamp precedente all'ultima già applicata, oppure contiene un errore. Si corregge con una **nuova** migrazione; quelle già applicate non si modificano.
5. Per ripetere il deploy senza nuovi commit: _Actions → CI → ultimo run → Re-run all jobs_.

Altri sintomi già incontrati: tabella in fondo ad [ambienti.md](ambienti.md).

## 2. Rollback

**App (Vercel).** Vercel → progetto → _Deployments_ → apri l'ultimo deploy funzionante → menu ⋯ → _Promote to Production_ (o _Instant Rollback_). L'app torna subito alla versione precedente. Poi correggi il codice con una PR: il deploy successivo sostituisce il rollback.

**Codice.** Su GitHub apri la PR che ha introdotto il problema → _Revert_ → unisci la PR di revert in `dev` (merge di `gennpalm`). Niente riscrittura della storia di `dev` o `main`.

**Database.** Le migrazioni non si annullano da sole. Se una migrazione ha rotto qualcosa:

1. fai il rollback dell'app, se la versione precedente funziona con lo schema nuovo;
2. scrivi una nuova migrazione che ripara (stesso flusso: PR verso `dev`);
3. solo se i dati sono persi o corrotti: ripristino da backup (§7).

## 3. Rinnovo di token e chiavi

L'elenco delle credenziali, con dove si rinnovano e le scadenze, è nella sezione _Credenziali da rinnovare_ di [ambienti.md](ambienti.md). Procedura comune:

1. crea il token nuovo sul servizio, con gli stessi permessi del vecchio;
2. aggiorna il segreto su GitHub (_Settings → Secrets and variables → Actions_) o la variabile su Vercel (_Settings → Environment Variables_);
3. per le variabili di Vercel serve un nuovo deploy (§1, _Re-run all jobs_);
4. verifica con un run del workflow che lo usa, poi revoca il token vecchio;
5. aggiorna la data in [ambienti.md](ambienti.md).

Se una chiave è finita in un log o in un commit: revocala **subito** sul servizio, poi segui i passi sopra. Una chiave esposta si considera compromessa anche se il commit viene cancellato.

## 4. Provider di dati non raggiungibile o crediti esauriti

**Come accorgersene.** _Data Center_ mostra la fonte con dati `STALE` e l'ultima raccolta riuscita; _Amministrazione → Agente_ mostra i job falliti o in `dead` e i contatori dei provider; in dashboard compare una notifica.

**Cosa fare.**

1. Controlla lo stato del provider sul suo sito. Se è un guasto temporaneo non serve fare nulla: l'agente riprova da solo con attese crescenti e al ciclo successivo recupera le finestre mancanti.
2. Job in `dead` dopo che il provider è tornato: _Amministrazione → Agente → Riprendi_.
3. Chiave rifiutata (401 o 403): rinnova la chiave (§3).
4. Crediti di The Odds API finiti: le quote restano quelle dell'ultima raccolta e diventano `STALE`; il Bet Builder non propone nulla con quote non `FRESH`, ed è il comportamento voluto. I crediti si rinnovano a inizio mese. Nessun piano a pagamento senza l'approvazione del proprietario (regola 7 di `CLAUDE.md`).

Dettagli: [data-collector.md](data-collector.md), [agent.md](agent.md), [docs/data-sources/](../data-sources/README.md).

## 5. Agente fermo o degradato

**Come accorgersene.** Notifica _Agente degradato_ in dashboard; in _Amministrazione → Agente_ l'ultimo ciclo riuscito è vecchio.

**Cosa fare.**

1. _Actions → Agent (Python)_: guarda l'ultimo run. Se GitHub ha saltato lo schedule, l'avvio di riserva da QStash lo rilancia da solo dopo 3 h 30.
2. Per non aspettare: _Actions → Agent (Python) → Run workflow_.
3. Se il run fallisce, il passo rosso dice quale job. I runbook dei singoli motori: [prediction-engine.md](prediction-engine.md), [bet-builder.md](bet-builder.md), [data-collector.md](data-collector.md).
4. Se anche l'heartbeat di QStash manca: console Upstash → _QStash → Schedules_ (lo schedule esiste? è in pausa?) e le chiavi di firma su Vercel ([agent.md](agent.md)).

## 6. Minuti di GitHub Actions esauriti

**Come accorgersene.** I workflow non partono e GitHub mostra l'avviso sui minuti inclusi; _Settings → Billing and plans_ del proprietario riporta il consumo del mese.

**Cosa succede.** Si fermano CI, deploy, agente Python e backup fino al mese successivo. L'app resta in linea con gli ultimi dati, che diventano `STALE`.

**Cosa fare.**

1. Non attivare pagamenti: budget €0.
2. Riduci il consumo per il resto del mese: meno push su `dev` (PR più grandi), niente avvii manuali non necessari.
3. Il backup ha la priorità: se i minuti stanno per finire, sospendi prima gli avvii manuali dei motori.
4. A inizio mese controlla che _Agent (Python)_ e _Backup_ siano ripartiti.

Budget e misure reali: [ADR 0035](../decisions/0035-pianificazione-agente.md) e [punto-della-situazione.md](punto-della-situazione.md).

## 7. Ripristino del database

Procedura completa in [backup-restore.md](backup-restore.md), sezione _Ripristino reale (emergenza)_. In breve: si ripristina l'ultimo backup cifrato su un progetto Supabase **nuovo o vuoto**, si aggiornano i segreti `*_SUPABASE_*` e le variabili di Vercel, si rilancia il deploy.

Serve la passphrase dei backup, che il proprietario conserva fuori da GitHub: senza, i backup sono illeggibili.

Dopo un ripristino: gli utenti devono rifare il login; controlla _Data Center_ e avvia a mano un ciclo dell'agente (§5) per recuperare i dati raccolti dopo il backup.

## 8. Progetto Supabase in pausa

Sul piano Free un progetto senza attività viene messo in pausa. L'agente lo tiene attivo scrivendo a ogni ciclo. Se l'app risponde con errori di database e la dashboard di Supabase mostra il progetto in pausa: _Restore project_ dalla dashboard, poi avvia un ciclo dell'agente (§5).

## 9. Account e accessi

Operazioni quotidiane (inviti, password dimenticata, sospensione, ruoli): [setup.md](setup.md) §6.

**Un Super Admin ha perso il dispositivo della 2FA.** Un altro Super Admin non può toglierla dall'app. Il proprietario rimuove il fattore TOTP dell'utente dalla dashboard di Supabase (_Authentication → Users_, scheda dell'utente) e l'utente la riattiva al primo accesso da _Impostazioni → Sicurezza_. L'operazione va annotata, perché non passa dall'audit dell'app. **Da provare su DEV** con un account di prova prima che serva davvero: la posizione del comando nella dashboard non è stata verificata.

**Nessun Super Admin riesce a entrare.** Workflow _Bootstrap Super Admin_ ([checklist di messa in servizio](checklist-messa-in-servizio.md), fase D).

**Sospetto accesso non autorizzato.** Sospendi l'account (_Amministrazione → Utenti_): blocca subito login e sessioni. Controlla _Amministrazione → Audit_ filtrando per quell'utente e per periodo. Genera un link di reset della password solo dopo aver sentito la persona con un canale diverso.
