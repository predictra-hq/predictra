# M2 — Football data: piano e corsie

**Stato:** da iniziare · **Dipende da:** M1 (in servizio su DEV) · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Portare in PREDICTRA partite reali, con provenienza e qualità tracciate, e renderle visibili.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- partite reali su DEV, ognuna con provider, ID del provider, `observed_at` e stato di qualità;
- adapter testati con risposte registrate (fixture);
- salute dei provider visibile nell'app (pannello Source Intelligence);
- `pnpm check` e CI verdi, nessuna chiave nei log o nel codice, nessun dato inventato.

## Assegnazione

| Corsia          | Persona | Issue | Stato       |
| --------------- | ------- | ----- | ----------- |
| 0 — contratto   | —       | —     | da iniziare |
| A — ingestion   | —       | —     | da iniziare |
| B — interfaccia | —       | —     | da iniziare |

Chi prende una corsia scrive il proprio nome qui nella sua prima PR.

## Prerequisiti

| #   | Cosa                                                                                                                       | Chi        | Serve a           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------- |
| P1  | Registrazione gratuita su football-data.org e segreto GitHub `FOOTBALL_DATA_API_KEY`                                       | `gennpalm` | corsia A, fase A2 |
| P2  | Registrazione gratuita su API-Football (api-sports.io) e segreto GitHub `API_FOOTBALL_KEY`                                 | `gennpalm` | corsia A, fase A3 |
| P3  | Lettura dei termini d'uso di football-data.org e API-Football (nel piano M0 risultano NON VERIFICATI); esito nell'ADR 0010 | corsia 0   | tutte             |
| P4  | Verifica che esista un solo progetto Supabase DEV (l'integrazione Vercel può averne creato un secondo, da eliminare)       | `gennpalm` | ordine            |

Le corsie possono partire anche senza P1 e P2: i test usano fixture. Le fixture sono **risposte reali registrate** (o esempi della documentazione ufficiale del provider), salvate con fonte e data di registrazione; mai costruite a mano.

## Ordine di lavoro

```text
corsia 0 (contratto) ──► merge su dev ──┬──► corsia A (ingestion)   ──┐
                                        └──► corsia B (interfaccia) ──┴──► chiusura
```

## Corsia 0 — contratto (prima PR, una persona)

**Decisioni da prendere e scrivere nell'ADR 0010:**

- runtime dell'ingestion. Proposta: servizio Python in `services/data-collector/` eseguito da un workflow schedulato di GitHub Actions; QStash rimandato a M7 (ADR 0002). Alternativa: job TypeScript su Vercel;
- frequenza degli aggiornamenti e soglie FRESH/STALE per tipo di dato;
- competizioni della v1 secondo ADR 0004 e 0005;
- esito della verifica dei termini d'uso (P3).

**File:**

- `docs/decisions/0010-modello-dati-calcio.md`
- `docs/data-dictionary/football.md`
- `supabase/migrations/<timestamp>_football_core.sql`
- `supabase/tests/football.test.ts`
- `packages/shared-types/src/football.ts` (e l'export in `index.ts`)

**Contenuto della migrazione (proposta):**

- anagrafiche canoniche: `competitions`, `seasons`, `teams`, `team_aliases`;
- `matches` (stato, calcio d'inizio in UTC, squadre, punteggi) e `standings` (fotografie della classifica);
- `provider_entity_map`: per ogni entità canonica, provider e ID del provider;
- `ingestion_runs`: ogni esecuzione di un adapter (provider, inizio, fine, esito, richieste usate, errori);
- `data_quality_issues`: problemi trovati dai controlli, con gravità e stato;
- su ogni dato esterno: provider, ID del provider, `observed_at`, `event_time`, qualità e licenza (regola 4 di `CLAUDE.md`);
- viste per l'interfaccia, per esempio `v_match_center` e `v_source_health`: sono il punto di contatto tra le corsie A e B;
- RLS: lettura per gli utenti autenticati e attivi, scrittura solo con la chiave secret (job di ingestion).

**Fatto quando:** CI verde, migrazione applicata su DEV dal deploy, data dictionary e ADR scritti, test RLS sulle nuove tabelle.

## Corsia A — ingestion (dati, backend, job)

**File di proprietà:** `services/data-collector/**`, `.github/workflows/data-collector.yml` (nuovo), `docs/operations/data-collector.md` (runbook), nuove variabili in fondo a `.env.example`. Il job Python nel workflow `ci.yml` si aggiunge con una PR dedicata (vedi collaborazione.md §5).

| Fase | Contenuto                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | Scheletro del servizio Python (`pyproject.toml`, lint, test) e controlli in CI                                                                        |
| A2   | Adapter football-data.org: competizioni, squadre, partite, risultati, classifiche; limite di 10 richieste al minuto; mapping su `provider_entity_map` |
| A3   | Adapter API-Football per lo storico 2022–2024: massimo 100 richieste al giorno, ripresa dal punto in cui si era fermato (stato in `ingestion_runs`)   |
| A4   | Controlli di qualità: punteggio coerente con lo stato, duplicati, squadre non mappate, date anomale; scrittura di `data_quality_issues`               |
| A5   | Workflow schedulato su GitHub Actions e salute dei provider (ultima esecuzione, errori, quota residua)                                                |

**Fatto quando:** partite reali su DEV con provider, `observed_at` e qualità; adapter testati con fixture; esecuzioni idempotenti (rilanciare non duplica); nessuna chiave nei log.

## Corsia B — interfaccia

**File di proprietà:** `apps/web/src/app/(app)/match-center/**`, `apps/web/src/app/(app)/data-center/**`, `apps/web/src/lib/football/**` (letture lato server), `apps/web/src/components/football/**`, le sezioni `matchCenter` e `dataCenter` di `apps/web/src/lib/i18n/it.ts`, `apps/web/src/components/shell/nav-config.ts`, la card _Freschezza dati_ in `apps/web/src/app/(app)/dashboard/page.tsx`.

| Fase | Contenuto                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| B1   | Letture lato server sulle viste del contratto, con `requireUser` e test                                                       |
| B2   | Data Center / Source Intelligence: provider, ultimo aggiornamento, FRESH/STALE, ultime esecuzioni, problemi di qualità aperti |
| B3   | Match Center: elenco per competizione e giornata, filtri, dettaglio partita con provenienza e qualità                         |
| B4   | Stati vuoti ed errori, accessibilità, card _Freschezza dati_ in dashboard, attivazione delle voci di menu                     |

Finché la corsia A non ha caricato dati, le pagine mostrano lo stato vuoto. Eventuali dati di prova nei test sono etichettati `DEMO` e non arrivano mai su DEV.

**Fatto quando:** voci Match Center e Data Center attive, dati reali visibili su DEV dopo la corsia A, nessun dato inventato.

## Chiusura di M2

1. Corsie 0, A e B unite su `dev`, deploy DEV verde.
2. Verifica su DEV dei criteri di completamento in cima a questo file.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e [roadmap](README.md); piano della milestone successiva creato.
