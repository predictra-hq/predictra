# Runbook — Agente autonomo (M7)

Coda dei job su Postgres (ADR 0003), pianificazione e budget (ADR 0035). Contratto: [data dictionary](../data-dictionary/agent.md).

## Componenti

| Componente        | Dove                                 | Esegue                                                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Worker Python     | `services/agent` (`predictra_agent`) | job Python (raccolta dati, quote, previsioni, proposte: collegati in A5) |
| Worker TypeScript | `apps/web/src/lib/agent/`            | job leggeri degli endpoint `/api/jobs/*` chiamati da QStash (fase A3)    |
| Workflow          | `.github/workflows/agent-python.yml` | test del servizio; ciclo manuale su DEV (lo schedule arriva in A3)       |

Entrambi i worker seguono lo stesso ciclo:

1. aprono un `agent_run` (heartbeat);
2. prelevano un job alla volta tra i tipi che sanno eseguire, con un lease;
3. al successo completano il job; all'errore lo fanno fallire. Si ritenta con backoff, oppure il job va in `dead` se i tentativi sono esauriti o l'errore non è recuperabile;
4. chiudono il ciclo.

Un worker interrotto lascia il job `running`. Quando il lease scade, il ciclo successivo lo riprende come nuovo tentativo, quindi **i gestori devono essere idempotenti**.

Il worker Python, con `--minutes-quota`, conta i minuti di GitHub Actions in `agent_rate_limits` (`provider = 'github-actions'`, finestra mensile):

- 1 minuto all'avvio;
- a fine ciclo, la durata arrotondata per eccesso più 1 minuto per checkout e dipendenze.

A budget esaurito il ciclo si chiude come `failed` senza prelevare nulla.

## Job disponibili

| Tipo                    | Worker     | Cosa fa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent.selftest.python` | Python     | verifica del ciclo: non legge né scrive dati. Payload `{"fail_attempts": n}` fallisce i primi n tentativi; `{"permanent": true}` va subito in `dead`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `agent.selftest.web`    | TypeScript | come sopra, eseguito da `POST /api/jobs/cycle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `football-data.collect` | Python     | raccolta football-data.org della finestra di 3 ore (`payload.window_start`), con il codice di `services/data-collector`. Accodato dal ciclo con `--plan football-data` (schedule ogni 3 ore al minuto 47). Finestra già superata → chiuso senza chiamate. `FOOTBALL_DATA_API_KEY` mancante o payload non valido → dead-letter. Competizione fallita → nuovo tentativo con backoff. Scritture idempotenti (upsert di M2)                                                                                                                                                                                         |
| `odds.collect`          | Python     | quote The Odds API con il codice di `services/data-collector`: `daily` (06–15 UTC) e `prematch` (15–21 UTC), chiave `odds.collect:<modo>:<data>` e quindi al massimo una raccolta per modo al giorno. Accodato con `--plan odds`. Fuori finestra → chiuso senza crediti. Crediti già spesi → completato anche se parziale, mai ritentato. Nessun credito speso e tutto fallito → un solo nuovo tentativo (`max_attempts` 2). Crediti sotto la riserva o `ODDS_API_KEY` mancante → dead-letter                                                                                                                   |
| `api-football.details`  | Python     | statistiche e formazioni API-Football (ADR 0012), con il codice di `services/data-collector`: un job al giorno (`api-football.details:<data>`), accodato con `--plan football-data` se c'è `API_FOOTBALL_KEY`. Budget di 90 richieste al giorno e ripresa dal blocco successivo; senza chiave → dead-letter; stagione fallita → un nuovo tentativo                                                                                                                                                                                                                                                              |
| `predictions.run`       | Python     | previsioni del motore M4 con il codice di `services/prediction-engine`: finestre `morning` (03–12 UTC) e `afternoon` (12–21 UTC), chiave `predictions.run:<finestra>:<data>`, accodato con `--plan predictions` dopo la raccolta dello stesso ciclo. `PREDICTION_ENGINE_COMMIT` (ultimo commit del motore, ADR 0020) mancante o non valido → dead-letter. Modello fallito → un solo nuovo tentativo (`max_attempts` 2), perché ogni esecuzione scrive un nuovo insieme di previsioni. Fuori finestra → chiuso senza eseguire il motore. Le versioni di numpy e scipy sono verificate uguali a quelle del motore |
| `bet-builder.run`       | Python     | proposte dello Smart Bet Builder con il codice di `services/bet-builder`: finestre `morning` (06–15 UTC) ed `evening` (15–21 UTC), le stesse delle quote, chiave `bet-builder.run:<finestra>:<data>`, accodato per ultimo con `--plan bet-builder` (dopo quote e previsioni dello stesso ciclo). `BET_BUILDER_COMMIT` mancante o non valido → dead-letter. Senza modello attivo il job si completa con `skipped` (nessuna schedina forzata, ADR 0025). Errore del motore → un solo nuovo tentativo (`max_attempts` 2)                                                                                           |

I job reali di M2–M5 si collegano nella fase A5, uno per PR. Collegati tutti: raccolta football-data.org, quote, previsioni e proposte. I workflow _Data collector_, _Prediction engine_ e _Bet Builder_ restano per l'avvio manuale.

## Segreti

Il worker Python usa gli stessi segreti GitHub dei collector: `DEV_SUPABASE_PROJECT_ID` e `DEV_SUPABASE_SECRET_KEY`. Non serve `DATABASE_URL`, perché le RPC passano da PostgREST.

## Endpoint QStash (fase A3)

`POST /api/jobs/cycle` esegue un ciclo del worker TypeScript (`source = qstash`, `schedule = jobs-light`):

| Situazione                  | Risposta | Effetto                                                                |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| chiavi QStash non impostate | 503      | nessuno                                                                |
| firma assente o non valida  | 401      | nessuno: il database non viene toccato                                 |
| firma valida                | 200      | +1 messaggio nel budget giornaliero `qstash` (600, ADR 0035), un ciclo |

- La firma si verifica con le chiavi passate esplicitamente e `devMode: false`. Una variabile `QSTASH_DEV` non disattiva il controllo.
- L'URL firmato deve essere esattamente `APP_BASE_URL` + `/api/jobs/cycle`.
- Il proxy della sessione esclude `/api/jobs/*`: lì non c'è login, l'autorizzazione è la firma.
- La risposta è 200 anche se il ciclo fallisce. QStash non deve ritentare; l'esito è in `agent_runs`.

### Attivazione su DEV (`gennpalm`)

Verificato sulla documentazione di Upstash l'8/11/2026 (https://upstash.com/docs/qstash/howto/multi-region, https://upstash.com/docs/qstash/features/schedules):

- token e chiavi di firma si copiano dalla sezione _Quickstart_ della console di QStash;
- ogni regione (EU `https://qstash.upstash.io`, US `https://qstash-us-east-1.upstash.io`) ha token, chiavi, schedule e consumi propri: chiavi e schedule devono essere della stessa regione.

1. Console di Upstash → _QStash_ → _Quickstart_: copia `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` e annota la regione.
2. Vercel, progetto DEV → _Settings → Environment Variables_. Aggiungi `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY`:
   - tipo _Secret_;
   - ambiente _Production_, perché il deploy di DEV usa `--prod`.

   Non scrivere i valori in chat, issue o file.

3. Le variabili valgono dal deploy successivo: il prossimo merge su `dev`, oppure _Re-run_ dell'ultimo deploy.
4. Controlla che `APP_BASE_URL` su Vercel sia l'URL pubblico di DEV, senza slash finale.
5. Verifica da terminale:

   ```bash
   curl -s -X POST https://predictra-dev.vercel.app/api/jobs/cycle
   ```

   Atteso `{"error":"Firma non valida"}`. Se invece risponde `QStash non configurato`, le chiavi non sono arrivate al deploy.

6. In QStash crea uno schedule:
   - destinazione `https://predictra-dev.vercel.app/api/jobs/cycle`, metodo `POST`;
   - cron `*/15 * * * *`;
   - **retry 0**.

   Sono 96 messaggi al giorno, entro il budget di 600. La cadenza adattiva (ADR 0035 §3) arriva con la fase A4.

7. Dopo 15 minuti, in `agent_runs` compare un ciclo `qstash` / `jobs-light` `succeeded`. In `agent_rate_limits` (`qstash`, `day`) compare il conteggio.

Lo schedule di GitHub Actions per il worker Python resta spento fino alla fase A5. Finché i job reali non passano dalla coda consumerebbe minuti a vuoto (circa 2 per ciclo).

## Monitoraggio (corsia B)

- **Dashboard → card _Stato agente_**, solo per chi ha `agents.monitor` (Admin e Super Admin): stato complessivo, ultimo ciclo riuscito e frequenza reale per sorgente.
  - _Operativo_: l'ultimo ciclo riuscito è entro la soglia.
  - _Degradato_: nessun ciclo riuscito oltre 3 volte la cadenza attesa (ADR 0035).
  - _Mai avviato_: nessun ciclo registrato.

  Una sorgente non ancora pianificata, come GitHub Actions prima della fase A5, non rende l'agente degradato. Gli altri utenti vedono solo un messaggio: la RLS non mostra loro i dati.

- **Amministrazione → _Agente_** (`/admin/agent`), con 2FA:
  - stato per sorgente, code per tipo e stato;
  - budget gratuiti della finestra corrente (`qstash` giornaliero, `github-actions` mensile);
  - ultimi 30 cicli con gli errori;
  - ultimi 50 job, filtrabili per stato.

  Un job in _dead-letter_ ha il pulsante **Riprendi**: lo rimette in coda con i tentativi azzerati. L'operazione è registrata nell'audit come `agent.job_retried`.

- **Dashboard → _Notifiche_**, per ogni utente e solo le proprie. Quando un job finisce in dead-letter, Admin e Super Admin ricevono una notifica con il link alla pagina dell'agente. Si possono segnare come lette una alla volta o tutte insieme. Nessuna email (ADR 0008).

## Watchdog e avvio di riserva (fase A4)

- **Watchdog:** `agent_watchdog()` gira a ogni giro di QStash e alla fine di ogni ciclo Python. Se una sorgente che ha già girato è _Degradata_ (QStash oltre 45 minuti, GitHub Actions oltre 6 ore senza un ciclo riuscito), Admin e Super Admin ricevono la notifica _Agente degradato_ in dashboard, una volta per episodio. Nessuna email.
- **Avvio di riserva del ciclo Python:** se GitHub non avvia il ciclo programmato da oltre 3 h 30, il giro QStash chiede a GitHub di avviare _Agent (Python)_ su `dev`, con le stesse pianificazioni dello schedule. Al massimo una volta l'ora (contatore `github-dispatch` in _Amministrazione → Agente_). L'esito è nel campo `github_dispatch` della risposta dell'endpoint: `disabled`, `not-needed`, `rate-limited`, `dispatched` o `failed`.

### Attivare l'avvio di riserva (`gennpalm`)

Resta spento finché non esiste il token. Costo zero: i minuti sono quelli del ciclo, dentro il budget di 900 al mese.

1. GitHub → foto profilo → _Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token_:
   - nome `predictra-agent-dispatch`;
   - scadenza a scelta, da annotare in [ambienti.md](ambienti.md);
   - _Repository access_: solo `gennpalm/predictra`;
   - _Permissions → Repository permissions → Actions: Read and write_, nient'altro.
2. Vercel → progetto DEV → _Settings → Environment Variables_: `GITHUB_DISPATCH_TOKEN`, tipo _Secret_, ambiente _Production_. Non scriverlo in chat, issue o file.
3. Fai un nuovo deploy di DEV: il prossimo merge su `dev`, oppure _Re-run_ dell'ultimo run CI su `dev`.

## Verifica del worker Python su DEV (dopo il merge in `main`)

L'avvio manuale compare in _Actions_ solo quando il workflow è anche su `main`.

1. _Actions → Agent (Python) → Run workflow_, branch `dev`, `selftest` = `riuscito`. Atteso:
   - nel log `Ciclo N (github_actions/agent-python) — succeeded: prelevati=1 completati=1`;
   - in `agent_runs` il ciclo `succeeded`;
   - il job `agent.selftest.python:<run id>` in stato `done`.
2. Di nuovo, con `fallisce-una-volta`. Atteso:
   - ciclo `partial` e job `failed` con `next_run_at` dopo il backoff (circa 15–30 secondi);
   - un ciclo successivo, avviato dopo quel tempo, lo completa.
3. Con `non-recuperabile`. Atteso:
   - il job va subito in `dead`;
   - Admin e Super Admin ricevono la notifica `agent.job_dead` in `notifications`.

   La ripresa manuale (`retry_dead_agent_job`) arriva con la pagina di amministrazione della corsia B.

## Comandi locali

```bash
cd services/agent
uv sync
uv run pytest
uv run python -m predictra_agent cycle --source manual --max-jobs 1   # richiede SUPABASE_URL e SUPABASE_SECRET_KEY
```
