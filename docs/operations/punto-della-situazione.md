# Punto della situazione

**Aggiornato:** 8/11/2026 (`gennpalm` con Claude Code). Chi riprende il lavoro legge prima questo file, poi [CLAUDE.md](../../CLAUDE.md) e il piano della milestone in [docs/roadmap/](../roadmap/README.md).

## Cosa è in servizio su DEV

| Area                                                                              | Stato                                                                               | Dove                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| M1: accesso su invito, ruoli, 2FA, amministrazione                                | ✅                                                                                  | https://predictra-dev.vercel.app                             |
| M2: partite e classifiche delle 8 competizioni della v1 (stagione in corso)       | ✅ 2.508 partite, raccolte da football-data.org                                     | Match Center, Data Center                                    |
| M3 corsia 0: contratto quote, margine e statistiche                               | ✅ migrazioni applicate                                                             | `docs/data-dictionary/odds.md`                               |
| M3 corsia A: raccolta quote The Odds API, `packages/quant`                        | ✅ prima raccolta reale: 108 eventi, 51 abbinati alle partite, 491 crediti residui  | PR #10, runbook [data-collector.md](data-collector.md)       |
| Raccolte automatiche: football-data ogni 3 ore, quote alle 07:23 e alle 16:37 UTC | ✅ dall'8/11/2026 (`dev` unito in `main`)                                           | _Actions → Data collector_                                   |
| M3 corsia B: Market Intelligence, Statistics Center, League Intelligence, alias   | 🔄 in revisione (PR `feature/m3-b-interfaccia`), in servizio dopo il merge in `dev` | `/markets`, `/statistics`, `/leagues`, `/admin/team-aliases` |

## Cosa resta da fare, in ordine

1. **M3 corsia B (interfaccia): in revisione.** PR `feature/m3-b-interfaccia` verso `dev`. Dopo il merge:
   - verificare su DEV le tre pagine e la pagina admin _Alias squadre_ (`/admin/team-aliases`, solo Super Admin con 2FA);
   - aggiungere dalla pagina gli alias per i nomi di The Odds API non riconosciuti (57 eventi non abbinati nella prima raccolta). L'abbinamento avviene alla raccolta successiva; gli eventi già giocati non tornano più dal provider e restano non abbinati;
   - poi la chiusura di M3 (piano M3, _Chiusura_).
2. **M4 (modelli)** può partire in parallelo a M3 corsia B. Lo storico disponibile è solo la stagione in corso finché la fase A3 di M2 resta bloccata.
3. **M6 (bankroll)** è indipendente da tutto il resto.

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
