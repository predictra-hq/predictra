# M6 — Bankroll e tracker: piano e corsie

**Stato:** completata, in servizio su DEV dall'8/11/2026 · **Dipende da:** M1 (base), M4 (stake suggeriti), M3 (CLV) · **Può partire quando:** **subito** per contratto, registrazione manuale e metriche di base; lo stake con Kelly aspetta le previsioni di M4 · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

È la milestone più indipendente: si può fare in parallelo a M2, M3 o M4.

## Obiettivo

Ogni utente gestisce il proprio bankroll e registra le proprie giocate (reali o simulate) per misurarne i risultati. PREDICTRA non movimenta denaro e non piazza scommesse: è un registro personale.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- isolamento RLS testato: ogni utente vede solo i propri dati;
- **nessun admin**, nemmeno un Super Admin, accede al bankroll altrui (vedi `docs/operations/security.md` e il commento in `packages/shared-types/src/roles.ts`);
- giocate simulate e giocate reali distinte ovunque (dati, metriche, interfaccia).

## Assegnazione

| Corsia                 | Persona   | Issue | Stato       |
| ---------------------- | --------- | ----- | ----------- |
| 0 — contratto          | Alfry1299 | —     | unita (#25) |
| A — metriche e staking | Alfry1299 | —     | unita (#27) |
| B — interfaccia        | Alfry1299 | —     | unita (#28) |

## Prerequisiti

Nessun account o segreto nuovo.

## Cosa serve dalle altre milestone

| Da  | Cosa                                              | Se non è ancora su `dev`                                                                       |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1  | utenti, profili, RLS di base                      | già su `dev`                                                                                   |
| M2  | `matches` per collegare una giocata a una partita | campo facoltativo: si parte con descrizione libera e si collega alla partita quando M2 è unita |
| M4  | probabilità per lo stake suggerito (Kelly)        | lo stake flat funziona da subito; Kelly si aggiunge dopo                                       |
| M3  | quote di chiusura dai propri snapshot (CLV)       | il CLV si aggiunge dopo, dichiarato come approssimato (M0 §4)                                  |

## Decisioni da prendere (ADR 0030–0034)

- **ADR 0030 — Modello dati e privacy del bankroll:** più bankroll per utente o uno solo, valuta, movimenti (depositi, prelievi, rettifiche registrati a mano), retention e cancellazione dei dati personali.
- **ADR 0031 — Staking:** flat e Kelly frazionario con limite massimo (frazione e tetto da definire), comportamento quando la probabilità manca.
- **Limiti personali:** quali (per esempio stake massimo, perdita massima giornaliera o settimanale) e cosa succede quando si superano (avviso, blocco della registrazione).
- Accesso ai dati altrui: escluso. Un eventuale accesso futuro richiede un grant esplicito e tracciato, non un ruolo (commento in `roles.ts`): fuori dalla v1.

## Corsia 0 — contratto

**File:** ADR 0030–0031, `docs/data-dictionary/bankroll.md`, `supabase/migrations/<timestamp>_bankroll.sql`, `supabase/tests/bankroll.test.ts`, `packages/shared-types/src/bankroll.ts`.

**Contenuto proposto:**

- `bankrolls`, `bankroll_movements`, `bets` (con `kind` = `real` o `simulated`, partita facoltativa, mercato, quota, stake, esito), `personal_limits`;
- RLS **solo proprietario** su tutte le tabelle, senza alcuna policy per gli admin;
- test: un utente non legge né modifica i dati di un altro; un Super Admin non legge i dati di nessuno.

**Fatto quando:** CI verde, migrazione su DEV, test di isolamento verdi.

## Corsia A — metriche e staking

**File di proprietà:** `packages/bankroll/**` (nuovo, TypeScript, con test) oppure funzioni SQL nella migrazione di una PR di contratto dedicata.

| Fase | Contenuto                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------- |
| A1   | Metriche: profitto, ROI, yield, percentuale di successo, drawdown massimo, separate per reali e simulate |
| A2   | Stake flat e controllo dei limiti personali                                                              |
| A3   | Kelly frazionario limitato (dopo M4)                                                                     |
| A4   | CLV approssimato dai propri snapshot di quote (dopo M3)                                                  |

**Fatto quando:** funzioni testate con casi calcolati a mano e documentati.

## Corsia B — interfaccia

**File di proprietà:** `apps/web/src/app/(app)/bankroll/**`, `apps/web/src/app/(app)/tracker/**`, `apps/web/src/lib/bankroll/**`, `apps/web/src/components/bankroll/**`, le chiavi `bankroll` e `tracker` di `it.ts`, le righe delle due voci in `nav-config.ts`.

| Fase | Contenuto                                                                   |
| ---- | --------------------------------------------------------------------------- |
| B1   | Bankroll: saldo, movimenti, limiti personali                                |
| B2   | Tracker: registrazione delle giocate reali e simulate, chiaramente distinte |
| B3   | Metriche e grafici, filtri per periodo, tipo e mercato                      |
| B4   | Stake suggerito (dopo M4) e avvisi sui limiti                               |

**Fatto quando:** due voci di menu attive, isolamento verificato su DEV con due utenti di prova.

## Esito (8/11/2026)

| Criterio                                                        | Esito                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolamento RLS: ogni utente vede solo i propri dati             | ✅ test sul database (12) e verifica automatica su DEV con account temporanei (workflow _Verifica DEV_, `bankroll-isolation`): un utente non vede, non modifica e non cancella i dati di un altro |
| Nessun admin, nemmeno un Super Admin, accede al bankroll altrui | ✅ nessuna policy per gli admin (test) e verifica su DEV: il Super Admin vede 0 righe                                                                                                             |
| Giocate reali e simulate distinte ovunque                       | ✅ tipo del bankroll ereditato dalle giocate; metriche e interfaccia separate                                                                                                                     |
| Limiti personali                                                | ✅ blocco nel database verificato su DEV ("Limite personale superato: stake massimo")                                                                                                             |

Verifica su DEV: 15 controlli superati, 3 account di prova creati e cancellati. Per ripeterla: _Actions → Verifica DEV → Run workflow_.

Resta da collegare lo **stake con Kelly** nel Tracker: richiede di legare una giocata a una previsione del modello attivo (M4). Le funzioni sono già pronte in `@predictra/bankroll`.

## Chiusura di M6

1. Corsie unite su `dev`, deploy DEV verde.
2. Verifica su DEV con due account diversi: nessuno vede i dati dell'altro, nemmeno da Super Admin.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e nella [roadmap](README.md).
