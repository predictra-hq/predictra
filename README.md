# PREDICTRA — Football Intelligence Engine

> Data-powered. Mathematics-driven.

Piattaforma privata di football intelligence: dati storici e aggiornati, modelli probabilistici, analisi delle quote e gestione del rischio. È uno strumento **informativo e analitico**: non piazza scommesse, non movimenta denaro e non promette vincite.

## Stato

| Milestone                                                                      | Stato                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| M0 — Audit e piano                                                             | ✅ approvata                                                 |
| M1 — Fondazioni (monorepo, auth su invito senza email, ruoli, 2FA, RLS, CI/CD) | ✅ in servizio su DEV: https://predictra-dev.vercel.app      |
| M2 — Football data                                                             | prossima: [piano e corsie](docs/roadmap/M2-football-data.md) |
| M3–M8                                                                          | [roadmap](docs/roadmap/README.md)                            |

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
- **Lavorare in parallelo (regole del team):** [docs/operations/collaborazione.md](docs/operations/collaborazione.md)
- **Roadmap, dipendenze e corsie:** [docs/roadmap/](docs/roadmap/README.md)

- Ambienti, account, segreti e scadenze: [docs/operations/ambienti.md](docs/operations/ambienti.md)
- Piano tecnico e matrici free tier: [docs/architecture/M0-piano-tecnico.md](docs/architecture/M0-piano-tecnico.md)
- Decisioni architetturali: [docs/decisions/](docs/decisions/README.md)
- **Checklist di messa in servizio (da zero):** [docs/operations/checklist-messa-in-servizio.md](docs/operations/checklist-messa-in-servizio.md)
- Setup e deploy: [docs/operations/setup.md](docs/operations/setup.md)
- Controlli di sicurezza: [docs/operations/security.md](docs/operations/security.md)
- Data dictionary: [identità](docs/data-dictionary/identity.md), [calcio](docs/data-dictionary/football.md)
- Fonti dati e termini d'uso: [docs/data-sources/](docs/data-sources/README.md)

## Branch

| Branch      | Uso                      |
| ----------- | ------------------------ |
| `main`      | produzione stabile       |
| `dev`       | integrazione             |
| `feature/*` | sviluppo, PR verso `dev` |

Nomi dei branch di sviluppo: `feature/m<N>-<0|a|b>-<slug>` (milestone e corsia), oppure `feature/docs-<slug>`. Dettagli in [collaborazione.md](docs/operations/collaborazione.md).
