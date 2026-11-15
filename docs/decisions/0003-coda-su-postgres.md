# ADR 0003 — Coda, lock e dead-letter su Postgres

**Stato:** Accettata (approvata il 2026-11-07) · **Data:** 2026-11-07

## Contesto

Servono queue, lock distribuiti, retry con backoff, idempotenza, dead-letter e recupero dopo interruzioni. I servizi di coda gratuiti (QStash, Cloudflare Queues) hanno limiti stretti e aggiungono una dipendenza.

## Decisione

- Tabella `agent_jobs` con: `type`, `idempotency_key` (UNIQUE), `payload`, `status` (`queued|running|done|failed|dead`), `attempts`, `max_attempts`, `next_run_at`, `locked_by`, `locked_until`, `last_error`.
- Prelievo con `SELECT … FOR UPDATE SKIP LOCKED`. Lease con `locked_until` per recuperare i job di worker interrotti.
- Backoff esponenziale con jitter. Superato `max_attempts`, lo stato passa a `dead` (dead-letter visibile in Administration).
- Lock di risorsa (per provider o per partita) con `pg_try_advisory_xact_lock`.
- `agent_runs` registra ogni ciclo (heartbeat). Il rate limit per provider è un contatore in tabella.

## Conseguenze

- Un solo sistema da monitorare e sottoporre a backup.
- Throughput limitato ma ampiamente sufficiente al volume previsto.
