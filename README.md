# PREDICTRA — Football Intelligence Engine

> Data-powered. Mathematics-driven.

Piattaforma privata di football intelligence: dati storici e aggiornati, modelli probabilistici, analisi delle quote e gestione del rischio. È uno strumento **informativo e analitico**: non piazza scommesse, non movimenta denaro e non promette vincite.

## Stato

| Milestone                                                                      | Stato                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Audit e piano                                                             | ✅ approvata                                                                                                                                                                                                                |
| M1 — Fondazioni (monorepo, auth su invito senza email, ruoli, 2FA, RLS, CI/CD) | ✅ in servizio su DEV: https://predictra-dev.vercel.app                                                                                                                                                                     |
| M2 — Football data                                                             | ✅ in servizio su DEV (8 competizioni, raccolta da football-data.org); backfill API-Football in preparazione (termini verificati l'11/11/2026): [piano](docs/roadmap/M2-football-data.md)                                   |
| M3 — Statistiche e quote                                                       | ✅ completata l'11/11/2026, in servizio su DEV: quote 1X2 reali, margine e de-margin, pagine Market, Statistics e League Intelligence, alias squadre ([piano](docs/roadmap/M3-statistiche-e-quote.md))                      |
| M5 — Smart Bet Builder                                                         | ✅ in servizio su DEV: proposte da modello attivo e quote reali FRESH, nessuna schedina forzata ([piano](docs/roadmap/M5-bet-builder.md), [runbook](docs/operations/bet-builder.md))                                        |
| M4 — Prediction engine                                                         | ✅ in servizio su DEV (modello attivo: Poisson; [runbook](docs/operations/prediction-engine.md))                                                                                                                            |
| M6 — Bankroll e tracker                                                        | ✅ in servizio su DEV (isolamento verificato con il workflow _Verifica DEV_)                                                                                                                                                |
| M7 — Agente autonomo                                                           | ✅ completata, in servizio su DEV: coda su Postgres, raccolte, previsioni e proposte programmate dall'agente, watchdog e avvio di riserva, monitoraggio in _Amministrazione → Agente_ ([runbook](docs/operations/agent.md)) |
| M8                                                                             | [roadmap](docs/roadmap/README.md)                                                                                                                                                                                           |

## Struttura

```text
apps/web/                 Next.js 16 (App Router), TypeScript strict, Tailwind 4 — UI + Server Actions
packages/shared-types/    ruoli, permessi e regole di dominio condivise (con test)
packages/config/          tsconfig condivisi
services/data-collector/  raccolta dati calcio in Python (football-data.org → Supabase), con test
supabase/migrations/      migrazioni SQL versionate (schema, RLS, RPC)
supabase/tests/           test di migrazione, RLS e isolamento (Postgres embedded)
supabase/config.toml      impostazioni Auth applicate dalla pipeline
docs/                     architettura, ADR, data dictionary, operations
.github/workflows/        CI + deploy automatico (Supabase migrazioni/config, Vercel)
```

## Comandi

```bash
pnpm install       # dipendenze
pnpm dev           # app web su http://localhost:3000 (richiede apps/web/.env.local)
pnpm check         # lint + typecheck + test + build di tutto il monorepo
pnpm format        # formattazione Prettier
```

## Documentazione

- **Istruzioni per sviluppatori e agenti: [CLAUDE.md](CLAUDE.md)**
- **Dove siamo arrivati: [punto della situazione](docs/operations/punto-della-situazione.md)**
- **Lavorare in parallelo (regole del team):** [docs/operations/collaborazione.md](docs/operations/collaborazione.md)
- **Roadmap, dipendenze e corsie:** [docs/roadmap/](docs/roadmap/README.md)

- Ambienti, account, segreti e scadenze: [docs/operations/ambienti.md](docs/operations/ambienti.md)
- Piano tecnico e matrici free tier: [docs/architecture/M0-piano-tecnico.md](docs/architecture/M0-piano-tecnico.md)
- Decisioni architetturali: [docs/decisions/](docs/decisions/README.md)
- **Checklist di messa in servizio (da zero):** [docs/operations/checklist-messa-in-servizio.md](docs/operations/checklist-messa-in-servizio.md)
- Setup e deploy: [docs/operations/setup.md](docs/operations/setup.md)
- Controlli di sicurezza: [docs/operations/security.md](docs/operations/security.md)
- Interfaccia (navigazione, app sul telefono, tema, fluidità): [docs/operations/interfaccia.md](docs/operations/interfaccia.md)
- Runbook operativo (deploy, rollback, guasti, ripristino): [docs/operations/runbook.md](docs/operations/runbook.md)
- Checklist di produzione (M8): [docs/operations/checklist-produzione.md](docs/operations/checklist-produzione.md)
- Data dictionary: [identità](docs/data-dictionary/identity.md), [calcio](docs/data-dictionary/football.md), [quote e statistiche](docs/data-dictionary/odds.md), [previsioni](docs/data-dictionary/predictions.md), [bankroll](docs/data-dictionary/bankroll.md)
- Fonti dati e termini d'uso: [docs/data-sources/](docs/data-sources/README.md)

## Branch

| Branch      | Uso                      |
| ----------- | ------------------------ |
| `main`      | produzione stabile       |
| `dev`       | integrazione             |
| `feature/*` | sviluppo, PR verso `dev` |

Nomi dei branch di sviluppo: `feature/m<N>-<0|a|b>-<slug>` (milestone e corsia), oppure `feature/docs-<slug>`.

**Regola dei branch:** `gennpalm` lavora direttamente su `dev` (dal 14/11/2026); il collega (o chiunque altro sviluppi) lavora **solo su branch `feature/*`** e apre una PR verso `dev`; il merge lo fa `gennpalm`. GitHub **cancella automaticamente il branch** appena la PR viene unita (_Settings → General → Automatically delete head branches_, attivo dall'8/11/2026). Quindi nella pagina _Branches_ restano solo `main`, `dev` e il lavoro **non ancora unito**: se esiste un branch `feature/*`, quel lavoro non è ancora in `dev`. Dopo un merge non si continua sullo stesso branch: si riparte da `dev` aggiornato con un branch nuovo. Dettagli in [collaborazione.md](docs/operations/collaborazione.md).
