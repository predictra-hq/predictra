# Punto della situazione

**Aggiornato:** 8/11/2026 (`gennpalm` con Claude Code). Chi riprende il lavoro legge prima questo file, poi [CLAUDE.md](../../CLAUDE.md) e il piano della milestone in [docs/roadmap/](../roadmap/README.md).

## Cosa è in servizio su DEV

| Area                                                                                                                                                          | Stato                                                                                  | Dove                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| M1: accesso su invito, ruoli, 2FA, amministrazione                                                                                                            | ✅                                                                                     | https://predictra-dev.vercel.app                             |
| M2: partite e classifiche delle 8 competizioni della v1 (stagione in corso)                                                                                   | ✅ 2.508 partite, raccolte da football-data.org                                        | Match Center, Data Center                                    |
| M3 corsia 0: contratto quote, margine e statistiche                                                                                                           | ✅ migrazioni applicate                                                                | `docs/data-dictionary/odds.md`                               |
| M3 corsia A: raccolta quote The Odds API, `packages/quant`                                                                                                    | ✅ prima raccolta reale: 108 eventi, 51 abbinati alle partite, 491 crediti residui     | PR #10, runbook [data-collector.md](data-collector.md)       |
| Raccolte e calcoli automatici dall'agente: football-data ogni 3 ore; quote alle 06:47 e 15:47; previsioni alle 03:47 e 12:47; proposte alle 06:47 e 15:47 UTC | ✅ football-data (#40), quote (#41), previsioni (#42) attivi da `main`; proposte (#43) | _Actions → Agent (Python)_, _Amministrazione → Agente_       |
| M3 corsia B: Market Intelligence, Statistics Center, League Intelligence, alias                                                                               | ✅ unita (#16)                                                                         | `/markets`, `/statistics`, `/leagues`, `/admin/team-aliases` |
| M5: Smart Bet Builder (contratto, motore, interfaccia)                                                                                                        | ✅ unita (#19, #20, #21); proposte reali con un modello M4 attivo                      | `/bet-builder`, _Actions → Bet Builder_                      |

## Cosa resta da fare, in ordine

1. **M3 corsia B (interfaccia): unita (#16).** Da fare ora:
   - verificare su DEV le tre pagine e la pagina admin _Alias squadre_ (`/admin/team-aliases`, solo Super Admin con 2FA);
   - aggiungere dalla pagina gli alias per i nomi di The Odds API non riconosciuti (57 eventi non abbinati nella prima raccolta). L'abbinamento avviene alla raccolta successiva; gli eventi già giocati non tornano più dal provider e restano non abbinati;
   - poi la chiusura di M3 (piano M3, _Chiusura_).
2. **M4 (modelli): completata** (#17, #18, #22, #23). Modello attivo: Poisson. Il motore gira dalla coda dell'agente alle 03:47 e alle 12:47 UTC (M7, #42) e prevede le partite dei 7 giorni successivi ([runbook](prediction-engine.md)). Per controllare cosa vede l'app: _Run workflow_ con `command = diagnose`.
3. **M5 (Smart Bet Builder): completata** (#19, #20, #21), ADR 0025–0027 accettati. Restano due passi operativi per vedere proposte reali:
   - le proposte programmate passano dalla coda dell'agente (06:47 e 15:47 UTC, dopo le quote; [runbook](bet-builder.md)) dal merge in `main` della #43;
   - attivare un modello del motore M4 (Super Admin con 2FA). All'inizio è probabile che le proposte siano zero (Confidence Score basso): è il comportamento voluto.
4. **M6 (bankroll): completata** (#25, #27, #28). Isolamento verificato su DEV con account temporanei: _Actions → Verifica DEV → Run workflow_. Da collegare in seguito: lo stake con Kelly nel Tracker.
5. **M8, backup (A1): in servizio** (#31, #32). Backup cifrato ogni giorno alle 02:30 UTC su Backblaze B2 (`us-east-005`) e test di ripristino il giorno 1 di ogni mese ([runbook](backup-restore.md)). Primo backup e primo ripristino da B2 riusciti l'8/11/2026. Lo schedule parte dopo il merge di `dev` in `main`. Hardening (A2) e revisione di sicurezza (A3) in servizio. Accessibilità (B1): 26 controlli su 26 superati con axe, verifica ripetibile con _Verifica DEV_ → `accessibility` ([accessibilita.md](accessibilita.md)). Il check salva anche gli screenshot di dashboard e lista utenti come artefatto del run (3 giorni). Dashboard rinnovata con dati reali: prossime partite con le probabilità 1X2 del modello attivo, bankroll personale, modello attivo, proposte del Bet Builder. Corretta la lista utenti, che era vuota per una relazione ambigua tra ruoli e profili. Ask PREDICTRA (ADR 0042, accettato): chat su Groq (piano gratuito) con strumenti in sola lettura, controllo che scarta i numeri non presenti nei dati e quota di 30 domande al giorno per utente; testo delle domande mai salvato. Restano: ambiente PROD (A4, servono i segreti `PROD_*`), step-up 2FA, runbook (B2) e checklist finale (B3).
6. **M7 (agente autonomo): completata l'11/11/2026** (#26, #33, #35, #38, #40–#43, #52). Runbook: [agent.md](agent.md); verifica di chiusura nel [piano M7](../roadmap/M7-agente-autonomo.md).
   - **Cosa gira:** _Agent (Python)_ ogni 3 ore al minuto 47 UTC. Ogni ciclo accoda le finestre correnti e le esegue nell'ordine indicato, con retry, dead-letter e notifiche:
     - raccolta football-data.org: ogni ciclo;
     - quote: 06:47 e 15:47;
     - previsioni: 03:47 e 12:47;
     - proposte del Bet Builder: 06:47 e 15:47.

     QStash chiama `/api/jobs/cycle` ogni 15 minuti: heartbeat, watchdog (notifica _Agente degradato_ in dashboard) e avvio di riserva del ciclo Python quando GitHub salta lo schedule per oltre 3 h 30. _Data collector_, _Prediction engine_ e _Bet Builder_ restano solo per l'avvio manuale.

   - **Da tenere d'occhio:** GitHub salta spesso lo schedule (9 cicli su 14 partiti dall'avvio di riserva tra il 9 e l'11/11). Minuti misurati: circa 570 al mese su 900.
   - **Rinviato:** cadenza adattiva di QStash vicino ai calci d'inizio (ADR 0035, modifica 4).

## Lavoro in corso (per chi riprende)

Nessuno. M7 è chiusa con la PR di chiusura. Prossimi passi possibili: M3 corsia B e chiusura di M3, M8 (ambiente PROD, runbook, checklist finale).

## Punti aperti

| Punto                                                          | Stato                                                                                                                                                                                                         | Chi                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Termini di API-Football (M2 fase A3, storico 2022–2024)        | non verificati: il sito chiede una verifica anti-bot (Cloudflare), va letto da un browser personale                                                                                                           | `gennpalm`, a mano: [api-football.md](../data-sources/api-football.md) |
| Deploy Vercel fermo su `Building…` per i commit di `Alfry1299` | risolto in modo conforme al piano gratuito: merge solo da `gennpalm` con _Create a merge commit_ e controllo dell'autore nel deploy (ADR 0050)                                                                | `gennpalm` fa i merge                                                  |
| `score.fullTime` con supplementari e rigori                    | da verificare sui dati reali (segnalato come `match.score_non_regular`)                                                                                                                                       | M2 corsia A                                                            |
| Fixture con risposte reali registrate                          | i test usano gli esempi ufficiali delle documentazioni                                                                                                                                                        | collector                                                              |
| GitHub Actions su Node 20 (deprecato)                          | solo avvisi, GitHub le esegue già su Node 24. Aggiornare `checkout`, `setup-node`, `pnpm/action-setup`, `setup-uv` e `supabase/setup-cli` alle major nuove in una PR dedicata, leggendo i cambi incompatibili | chiunque, bassa priorità                                               |

## Come lavorare in sessione

- Branch `feature/m<N>-<0|a|b>-<slug>` da `dev` aggiornato, PR verso `dev` con CI verde. Il merge lo fa solo `gennpalm` con **Create a merge commit** (piano Vercel Hobby, [ADR 0050](../decisions/0050-deploy-solo-commit-del-proprietario.md)).
- Dopo il merge GitHub cancella il branch da solo: un branch `feature/*` ancora presente è lavoro non ancora unito in `dev`. L'8/11/2026 sono stati eliminati gli 11 branch già uniti, dopo aver verificato che il loro contenuto fosse tutto in `dev`: restano solo `main` e `dev`.
- Lo schedule delle raccolte usa la versione di `.github/workflows/data-collector.yml` presente su `main`: dopo una modifica a quel file serve anche il merge di `dev` in `main`.
- Commit: solo la riga del titolo, in italiano, senza descrizione né `Co-Authored-By` (preferenza del proprietario).
- Raccolte manuali: _Actions → Data collector → Run workflow_, branch `dev`, campo `job` (`football-data`, `odds-daily`, `odds-prematch`).
  - Con `dry_run` non scrive nulla.
  - Le quote consumano comunque crediti: circa 1 per competizione, su 500 al mese.
