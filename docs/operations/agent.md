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

| Tipo                    | Worker     | Cosa fa                                                                                                                                              |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent.selftest.python` | Python     | verifica del ciclo: non legge né scrive dati. Payload `{"fail_attempts": n}` fallisce i primi n tentativi; `{"permanent": true}` va subito in `dead` |
| `agent.selftest.web`    | TypeScript | come sopra, per gli endpoint di A3                                                                                                                   |

I job reali di M2–M5 si collegano nella fase A5, uno per PR. Fino ad allora restano attivi i workflow attuali (_Data collector_, _Prediction engine_, _Bet Builder_).

## Segreti

Il worker Python usa gli stessi segreti GitHub dei collector: `DEV_SUPABASE_PROJECT_ID` e `DEV_SUPABASE_SECRET_KEY`. Non serve `DATABASE_URL`, perché le RPC passano da PostgREST.

## Verifica su DEV (dopo il merge in `main`)

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
