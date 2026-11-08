# Punto della situazione

**Aggiornato:** 8/11/2026 (`gennpalm` con Claude Code). Chi riprende il lavoro legge prima questo file, poi [CLAUDE.md](../../CLAUDE.md) e il piano della milestone in [docs/roadmap/](../roadmap/README.md).

## Cosa è in servizio su DEV

| Area                                                                              | Stato                                                                              | Dove                                                         |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| M1: accesso su invito, ruoli, 2FA, amministrazione                                | ✅                                                                                 | https://predictra-dev.vercel.app                             |
| M2: partite e classifiche delle 8 competizioni della v1 (stagione in corso)       | ✅ 2.508 partite, raccolte da football-data.org                                    | Match Center, Data Center                                    |
| M3 corsia 0: contratto quote, margine e statistiche                               | ✅ migrazioni applicate                                                            | `docs/data-dictionary/odds.md`                               |
| M3 corsia A: raccolta quote The Odds API, `packages/quant`                        | ✅ prima raccolta reale: 108 eventi, 51 abbinati alle partite, 491 crediti residui | PR #10, runbook [data-collector.md](data-collector.md)       |
| Raccolte automatiche: football-data ogni 3 ore, quote alle 07:23 e alle 16:37 UTC | ✅ dall'8/11/2026 (`dev` unito in `main`)                                          | _Actions → Data collector_                                   |
| M3 corsia B: Market Intelligence, Statistics Center, League Intelligence, alias   | ✅ unita (#16)                                                                     | `/markets`, `/statistics`, `/leagues`, `/admin/team-aliases` |
| M5: Smart Bet Builder (contratto, motore, interfaccia)                            | ✅ unita (#19, #20, #21); proposte reali con un modello M4 attivo                  | `/bet-builder`, _Actions → Bet Builder_                      |

## Cosa resta da fare, in ordine

1. **M3 corsia B (interfaccia): unita (#16).** Da fare ora:
   - verificare su DEV le tre pagine e la pagina admin _Alias squadre_ (`/admin/team-aliases`, solo Super Admin con 2FA);
   - aggiungere dalla pagina gli alias per i nomi di The Odds API non riconosciuti (57 eventi non abbinati nella prima raccolta). L'abbinamento avviene alla raccolta successiva; gli eventi già giocati non tornano più dal provider e restano non abbinati;
   - poi la chiusura di M3 (piano M3, _Chiusura_).
2. **M4 (modelli): completata** (#17, #18, #22, #23). Modello attivo: Poisson. Il motore gira alle 05:40 e alle 14:40 UTC e prevede le partite dei 7 giorni successivi ([runbook](prediction-engine.md)). Per controllare cosa vede l'app: _Run workflow_ con `command = diagnose`.
3. **M5 (Smart Bet Builder): completata** (#19, #20, #21), ADR 0025–0027 accettati. Restano due passi operativi per vedere proposte reali:
   - unire `dev` in `main`, così lo schedule del workflow _Bet Builder_ parte (07:53 e 17:07 UTC; [runbook](bet-builder.md));
   - attivare un modello del motore M4 (Super Admin con 2FA). All'inizio è probabile che le proposte siano zero (Confidence Score basso): è il comportamento voluto.
4. **M6 (bankroll): completata** (#25, #27, #28). Isolamento verificato su DEV con account temporanei: _Actions → Verifica DEV → Run workflow_. Da collegare in seguito: lo stake con Kelly nel Tracker.
5. **M8, backup (A1): in servizio** (#31, #32). Backup cifrato ogni giorno alle 02:30 UTC su Backblaze B2 (`us-east-005`) e test di ripristino il giorno 1 di ogni mese ([runbook](backup-restore.md)). Primo backup e primo ripristino da B2 riusciti l'8/11/2026. Lo schedule parte dopo il merge di `dev` in `main`. Prossime fasi di M8: hardening di sicurezza (A2–A3) e ambiente PROD (A4).
6. **M7 (agente autonomo):** corsia 0 unita (#26) e migrazione `20261108150000_agent.sql` applicata su DEV. [ADR 0035](../decisions/0035-pianificazione-agente.md) ancora da confermare (runbook: [agent.md](agent.md)): prima `gennpalm` riverifica da browser i limiti gratuiti di QStash e GitHub Actions (punto aperto sotto). Corsia A in corso: vedi _Lavoro in corso_.
   - Per la fase A3 `gennpalm` prepara: account gratuito Upstash con QStash, i segreti `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` su GitHub e su Vercel (tipo _Secret_). Nessun valore va scritto in chat, issue o file. `DATABASE_URL` **non serve**: i worker Python usano le RPC via PostgREST con `SUPABASE_SECRET_KEY`, come i collector.

## Lavoro in corso (per chi riprende)

Aggiornato a ogni passo, così una sessione interrotta riprende da qui.

**M7 corsia A, fasi A1–A2:** unite (#33). Worker Python `services/agent` e TypeScript `apps/web/src/lib/agent/`, workflow _Agent (Python)_ (ciclo manuale, senza schedule).

**M7 corsia A, fase A3 (endpoint QStash)** · branch `feature/m7-a-endpoint-jobs` · PR: [#35](https://github.com/gennpalm/predictra/pull/35), in attesa di CI e merge. Dopo il merge: attivazione QStash da parte di `gennpalm` (runbook [agent.md](agent.md), _Endpoint QStash_), poi fase A5 (job reali in coda) o A4 (cadenza adattiva).

| Passo | Contenuto                                                                                                                                                   | Stato                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1     | Verifica della firma QStash (`apps/web/src/lib/agent/qstash.ts`) con test; senza segreti l'endpoint risponde 503 "non configurato"                          | fatto: `qstash.ts` (SDK 2.12.1, `devMode: false`), test in `endpoint.test.ts` |
| 2     | Endpoint `POST /api/jobs/cycle`: firma, budget giornaliero QStash (ADR 0035 §2), ciclo del worker TypeScript                                                | fatto: `app/api/jobs/cycle/route.ts` + `lib/agent/endpoint.ts`, 8 test        |
| 3     | Esclusione di `/api/jobs/*` dal proxy della sessione; variabili in `.env.example` e `env.server.ts`                                                         | fatto                                                                         |
| 4     | Runbook: creare lo schedule su QStash (lo fa `gennpalm`, con retry 0). Lo schedule GitHub Actions resta spento fino ad A5, per non consumare minuti a vuoto | fatto: runbook `agent.md`, sezione _Endpoint QStash_                          |
| 5     | `pnpm check`, PR verso `dev`                                                                                                                                | fatto: `pnpm check` verde; PR aperta                                          |

## Punti aperti

| Punto                                                          | Stato                                                                                                                                                                                                         | Chi                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Termini di API-Football (M2 fase A3, storico 2022–2024)        | non verificati: il sito chiede una verifica anti-bot (Cloudflare), va letto da un browser personale                                                                                                           | `gennpalm`, a mano: [api-football.md](../data-sources/api-football.md) |
| Deploy Vercel fermo su `Building…` per i commit di `Alfry1299` | risolto in modo conforme al piano gratuito: merge solo da `gennpalm` con _Create a merge commit_ e controllo dell'autore nel deploy (ADR 0050)                                                                | `gennpalm` fa i merge                                                  |
| `score.fullTime` con supplementari e rigori                    | da verificare sui dati reali (segnalato come `match.score_non_regular`)                                                                                                                                       | M2 corsia A                                                            |
| Fixture con risposte reali registrate                          | i test usano gli esempi ufficiali delle documentazioni                                                                                                                                                        | collector                                                              |
| Limiti gratuiti di QStash e GitHub Actions (ADR 0035)          | non riverificati l'8/11/2026: le pagine ufficiali non sono raggiungibili dall'ambiente cloud. Per ora l'ADR usa i valori di M0 (7/11/2026) come tetto provvisorio                                             | `gennpalm`, da browser, prima di accettare l'ADR 0035                  |
| GitHub Actions su Node 20 (deprecato)                          | solo avvisi, GitHub le esegue già su Node 24. Aggiornare `checkout`, `setup-node`, `pnpm/action-setup`, `setup-uv` e `supabase/setup-cli` alle major nuove in una PR dedicata, leggendo i cambi incompatibili | chiunque, bassa priorità                                               |

## Come lavorare in sessione

- Branch `feature/m<N>-<0|a|b>-<slug>` da `dev` aggiornato, PR verso `dev` con CI verde. Il merge lo fa solo `gennpalm` con **Create a merge commit** (piano Vercel Hobby, [ADR 0050](../decisions/0050-deploy-solo-commit-del-proprietario.md)).
- Dopo il merge GitHub cancella il branch da solo: un branch `feature/*` ancora presente è lavoro non ancora unito in `dev`. L'8/11/2026 sono stati eliminati gli 11 branch già uniti, dopo aver verificato che il loro contenuto fosse tutto in `dev`: restano solo `main` e `dev`.
- Lo schedule delle raccolte usa la versione di `.github/workflows/data-collector.yml` presente su `main`: dopo una modifica a quel file serve anche il merge di `dev` in `main`.
- Commit: solo la riga del titolo, in italiano, senza descrizione né `Co-Authored-By` (preferenza del proprietario).
- Raccolte manuali: _Actions → Data collector → Run workflow_, branch `dev`, campo `job` (`football-data`, `odds-daily`, `odds-prematch`).
  - Con `dry_run` non scrive nulla.
  - Le quote consumano comunque crediti: circa 1 per competizione, su 500 al mese.
