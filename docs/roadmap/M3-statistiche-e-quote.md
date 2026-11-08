# M3 — Statistiche e quote: piano e corsie

**Stato:** in corso: corsie 0 e A fatte, quote reali su DEV; manca la corsia B · **Dipende da:** M2 · **Può partire quando:** il contratto di M2 (corsia 0) è su `dev` · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Raccogliere le quote 1X2 reali, calcolarne margine e probabilità implicite, e costruire le pagine di statistiche su dati reali.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- quote 1X2 salvate con timestamp di osservazione e stato FRESH/STALE visibile;
- test su overround e de-margin (rimozione del margine);
- copertura dichiarata: quali leghe e quali bookmaker ci sono davvero;
- `pnpm check` e CI verdi, nessun dato inventato.

## Assegnazione

| Corsia              | Persona   | Issue | Stato                                        |
| ------------------- | --------- | ----- | -------------------------------------------- |
| 0 — contratto       | Alfry1299 | —     | unita (#9)                                   |
| A — quote e calcoli | Alfry1299 | —     | A1–A4 in revisione (PR `feature/m3-a-quote`) |
| B — interfaccia     | —         | —     | da iniziare                                  |

## Prerequisiti

| #   | Cosa                                                                                                                 | Chi        | Serve a           |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------- |
| P1  | Registrazione gratuita su The Odds API e segreto GitHub `ODDS_API_KEY`                                               | `gennpalm` | corsia A, fase A2 |
| P2  | Verifica che i limiti del piano gratuito siano ancora 500 crediti al mese (M0 §2.3)                                  | corsia 0   | ADR 0015          |
| P3  | Rilettura dei termini d'uso di The Odds API (M0 §2.4: conservazione e valori derivati consentiti, rivendita vietata) | corsia 0   | ADR 0015          |

## Cosa serve dalle altre milestone

| Da  | Cosa                                                                | Se non è ancora su `dev`                                                                |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| M2  | tabelle `matches`, `teams`, `team_aliases`, `provider_entity_map`   | aspettare o chiedere il merge della corsia 0 di M2 (collaborazione.md §6)               |
| M2  | partite reali caricate su DEV (per abbinare gli eventi delle quote) | lavorare con fixture registrate; l'abbinamento reale si verifica dopo la corsia A di M2 |
| M2  | runtime dei job scelto nell'ADR 0010                                | usare la stessa scelta; se non è ancora decisa, deciderla insieme                       |

## Decisioni da prendere (ADR 0015–0019)

- **ADR 0015 — Quote v1:** regione `eu`, solo mercato `h2h` (1X2), leghe incluse, piano dei crediti (M0 §5: snapshot giornaliero sulle 8 leghe principali più refresh mirati prima delle partite, circa 490 crediti al mese), soglie FRESH/STALE.
- **ADR 0016 — Metodo di de-margin:** almeno il metodo proporzionale; valutare un secondo metodo (per esempio power o Shin) e indicare quale si mostra di default.
- Dove vivono le funzioni matematiche. Proposta: pacchetto TypeScript `packages/quant` con test, usato da interfaccia e job. Se servono anche in Python (M4, M5) si replicano con gli stessi casi di test.
- Rivalutare Cache Components (ADR 0006): calendari e statistiche sono dati condivisi e potrebbero essere messi in cache.

## Corsia 0 — contratto

**File:** `docs/decisions/0015-quote-v1.md`, `docs/decisions/0016-de-margin.md`, `docs/data-dictionary/odds.md`, `supabase/migrations/<timestamp>_odds.sql`, `supabase/tests/odds.test.ts`, `packages/shared-types/src/odds.ts`.

**Contenuto proposto:**

- `bookmakers` (con indicazione se autorizzato in Italia: in M0 risultano solo Codere e Unibet nella regione `eu`; gli altri sono solo riferimento statistico);
- `markets` (in v1 solo 1X2);
- `odds_snapshots`: partita, bookmaker, mercato, selezione, quota, `observed_at`, provider, ID dell'evento del provider, licenza;
- viste per l'interfaccia: ultima quota per partita e bookmaker, migliore quota, stato FRESH/STALE, copertura per lega;
- viste statistiche calcolate solo dai risultati di M2 (gol fatti e subiti, forma recente, rendimento casa e trasferta, medie per lega);
- RLS: lettura per utenti autenticati attivi, scrittura solo dai job.

**Fatto quando:** CI verde, migrazione applicata su DEV, ADR e data dictionary scritti.

## Corsia A — quote e calcoli

**File di proprietà:** `packages/quant/**` (nuovo), il codice delle quote nel runtime scelto in ADR 0010 (es. `services/data-collector/odds/**`), eventuale `.github/workflows/odds.yml`, variabili in fondo a `.env.example`.

| Fase | Contenuto                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| A1   | `packages/quant`: probabilità implicite, overround, de-margin, fair odds; test con casi calcolati a mano e documentati           |
| A2   | Adapter The Odds API: elenco eventi (gratuito), quote `h2h` regione `eu`; registrazione dei crediti consumati per ogni chiamata  |
| A3   | Abbinamento evento del provider → partita canonica tramite `team_aliases`; gli eventi non abbinati diventano problemi di qualità |
| A4   | Job schedulato con budget di crediti: si ferma prima di superare il limite mensile e lo segnala                                  |

**Fatto quando:** quote 1X2 reali su DEV con `observed_at`, crediti sotto controllo, test di quant verdi.

## Corsia B — interfaccia

**File di proprietà:** `apps/web/src/app/(app)/markets/**`, `apps/web/src/app/(app)/statistics/**`, `apps/web/src/app/(app)/leagues/**`, `apps/web/src/lib/odds/**`, `apps/web/src/components/odds/**`, le chiavi `marketIntelligence`, `statisticsCenter` e `leagueIntelligence` di `it.ts`, le righe delle tre voci in `nav-config.ts`.

| Fase | Contenuto                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| B1   | Market Intelligence: quote per partita e bookmaker, margine, probabilità implicite, FRESH/STALE, copertura reale dichiarata |
| B2   | Statistics Center: statistiche di squadra calcolate dai risultati, con provenienza dei dati                                 |
| B3   | League Intelligence: classifiche, medie gol, vantaggio casalingo per lega                                                   |
| B4   | Mercati non valutabili (corner, cartellini, tiri, marcatori) mostrati come "non valutabile" con il motivo (ADR 0005)        |

**Fatto quando:** tre voci di menu attive, dati reali su DEV, nessun bookmaker o mercato mostrato come disponibile se non lo è.

## Limiti noti

- 500 crediti al mese: niente aggiornamenti frequenti. Lo stato STALE deve essere sempre visibile.
- Bookmaker italiani: solo Codere e Unibet. Gli altri sono un riferimento e vanno etichettati come tali.
- Niente storico quote gratuito: il CLV (M6) si potrà calcolare solo sui propri snapshot, in modo approssimato.

## Cosa si aspettano le milestone successive

- M4 non dipende dalle quote; M5 e M6 sì: `odds_snapshots` e `packages/quant` devono restare stabili. Ogni cambio va in una PR di contratto.

## Chiusura di M3

1. Corsie unite su `dev`, deploy DEV verde.
2. Verifica dei criteri di completamento su DEV.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e nella [roadmap](README.md).
