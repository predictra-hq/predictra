# M7 — Agente autonomo: piano e corsie

**Stato:** in corso (corsia 0) · **Dipende da:** M2–M5 · **Può partire quando:** il contratto (coda, ADR 0003) **subito**; l'integrazione dei job quando i job di M2–M5 esistono · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Far lavorare PREDICTRA da sola, a cicli: raccolta dati, quote, previsioni e proposte vengono eseguite da una coda affidabile, con retry, recupero dopo le interruzioni e stato sempre visibile. Con budget zero non esiste un processo sempre attivo (ADR 0002): l'agente gira a intervalli e la UI dichiara la frequenza reale.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- test di idempotenza (rieseguire un job non duplica nulla) e di riavvio (un job interrotto viene ripreso);
- frequenza reale dichiarata nell'interfaccia, con l'ultimo ciclo riuscito.

## Assegnazione

| Corsia                       | Persona  | Issue | Stato                                      |
| ---------------------------- | -------- | ----- | ------------------------------------------ |
| 0 — contratto                | gennpalm | —     | in revisione (PR `feature/m7-0-contratto`) |
| A — coda e scheduler         | —        | —     | da iniziare                                |
| B — monitoraggio e notifiche | —        | —     | da iniziare                                |

## Prerequisiti

| #   | Cosa                                                                                                                                                                                                                                                                           | Chi        | Serve a           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------- |
| P1  | Account gratuito Upstash e QStash; segreti `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` su GitHub e su Vercel (tipo _Secret_). Nessun valore in chat, issue o file                                                                                  | `gennpalm` | corsia A, fase A3 |
| P2  | Riverifica dei limiti gratuiti di QStash (M0 §3: 1.000 messaggi al giorno, 10 schedule) e dei minuti GitHub Actions disponibili. **Aperto:** l'8/11/2026 le pagine ufficiali non erano raggiungibili dall'ambiente cloud; va fatta da un browser prima di accettare l'ADR 0035 | `gennpalm` | ADR 0035          |
| P3  | `DATABASE_URL` del progetto DEV come segreto GitHub, se i worker Python si collegano direttamente a Postgres (`.env.example`)                                                                                                                                                  | `gennpalm` | corsia A          |

## Cosa serve dalle altre milestone

| Da    | Cosa                                                         | Se non è ancora su `dev`                                                                                            |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| M2–M5 | i job esistenti (raccolta dati, quote, previsioni, proposte) | la coda si costruisce e si testa con job di prova; i job reali si collegano uno alla volta quando arrivano su `dev` |
| M1    | permesso `agents.monitor` (già presente in `roles.ts`)       | già su `dev`                                                                                                        |

## Decisioni da prendere (ADR 0035–0039)

- **ADR 0035 — Pianificazione:** quali job girano su QStash (leggeri, ogni 10–15 minuti, endpoint `/api/jobs/*` su Vercel con firma verificata) e quali su GitHub Actions (Python, ogni 1–3 ore); budget giornaliero di messaggi e mensile di minuti.
- **Polling adattivo:** frequenza più alta vicino ai calci d'inizio, più bassa nei giorni senza partite, sempre entro i budget.
- **Notifiche:** solo in dashboard (la piattaforma non invia email, ADR 0008).
- Il disegno della coda è già deciso nell'ADR 0003: questa milestone lo implementa.

## Corsia 0 — contratto

**File:** ADR 0035, `docs/data-dictionary/agent.md`, `supabase/migrations/<timestamp>_agent.sql`, `supabase/tests/agent.test.ts`, `packages/shared-types/src/agent.ts`.

**Contenuto (da ADR 0003):**

- `agent_jobs` con `type`, `idempotency_key` UNIQUE, `payload`, `status` (`queued`, `running`, `done`, `failed`, `dead`), `attempts`, `max_attempts`, `next_run_at`, `locked_by`, `locked_until`, `last_error`;
- `agent_runs` (heartbeat di ogni ciclo) e contatori di rate limit per provider;
- `notifications` per la dashboard, private per utente;
- funzioni per prelevare un job (`FOR UPDATE SKIP LOCKED` con lease) e per completarlo o rimandarlo con backoff;
- RLS: code e run leggibili solo con `agents.monitor`; notifiche solo dal proprietario.

**Fatto quando:** CI verde, migrazione su DEV, test di prelievo concorrente, lease scaduto e passaggio a `dead`.

## Corsia A — coda e scheduler

**File di proprietà:** `apps/web/src/app/api/jobs/**` (nuovo), `apps/web/src/lib/agent/**`, `services/*/agent/**` (adattatori della coda per i worker Python), `.github/workflows/agent-*.yml`, variabili in fondo a `.env.example`. Collegare i job esistenti di M2–M5 tocca i loro file: una PR per job, avvisando chi li ha scritti.

| Fase | Contenuto                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| A1   | Worker TypeScript e Python che prelevano, eseguono e completano i job; retry con backoff e jitter; dead-letter |
| A2   | Test di idempotenza e di riavvio (job interrotto a metà ripreso dopo la scadenza del lease)                    |
| A3   | Endpoint `/api/jobs/*` su Vercel con verifica della firma QStash; schedule su QStash e su GitHub Actions       |
| A4   | Recupero delle finestre mancanti dopo un'interruzione; polling adattivo                                        |
| A5   | Collegamento dei job reali di M2–M5, uno per PR                                                                |

**Fatto quando:** i job reali girano dalla coda su DEV; interrompere e riavviare non duplica dati.

## Corsia B — monitoraggio e notifiche

**File di proprietà:** `apps/web/src/app/(app)/admin/agent/**` (nuovo), `apps/web/src/components/agent/**`, la chiave `agent` di `it.ts`, la voce di amministrazione in `nav-config.ts`, le card _Stato agente_ e _Freschezza dati_ della dashboard (concordando con chi ha fatto M2 per la seconda).

| Fase | Contenuto                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------- |
| B1   | Card _Stato agente_ in dashboard: ultimo ciclo riuscito, frequenza reale, stato "degradato" oltre soglia |
| B2   | Administration → Agente: code, run, errori, dead-letter, con ripresa manuale di un job (con audit)       |
| B3   | Notifiche in dashboard                                                                                   |

**Fatto quando:** lo stato dell'agente su DEV corrisponde a ciò che succede davvero, anche quando un job fallisce.

## Limiti noti

- Lo schedule di GitHub Actions può partire in ritardo o saltare nelle ore di punta (M0 §3).
- Finiti i minuti mensili di GitHub Actions, i job Python si fermano fino al mese successivo: l'interfaccia deve mostrarlo.

## Chiusura di M7

1. Corsie unite su `dev`, deploy DEV verde, job reali in coda.
2. Test di idempotenza e riavvio verdi; frequenza reale visibile.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e nella [roadmap](README.md).
