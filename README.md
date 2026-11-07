# PREDICTRA — Football Intelligence Engine

> Data-powered. Mathematics-driven.

Piattaforma privata di football intelligence: dati storici e aggiornati, modelli probabilistici, analisi delle quote e gestione del rischio. È uno strumento **informativo e analitico**: non piazza scommesse, non movimenta denaro e non promette vincite.

## Stato

| Milestone                                                        | Stato                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M0 — Audit e piano                                               | ✅ approvata                                                                                         |
| M1 — Fondazioni (monorepo, auth, inviti, ruoli, 2FA, RLS, shell) | ✅ codice completato; attivazione su Supabase/Vercel da eseguire ([setup](docs/operations/setup.md)) |
| M2 — Football data                                               | da iniziare                                                                                          |

## Struttura

```text
apps/web/                 Next.js 16 (App Router), TypeScript strict, Tailwind 4 — UI + Server Actions
packages/shared-types/    ruoli, permessi e regole di dominio condivise (con test)
packages/config/          tsconfig condivisi
supabase/migrations/      migrazioni SQL versionate (schema, RLS, RPC)
supabase/tests/           test di migrazione, RLS e isolamento (Postgres embedded)
supabase/templates/       template email di Supabase Auth
docs/                     architettura, ADR, data dictionary, operations
.github/workflows/        CI (lint, typecheck, test, build, audit, gitleaks)
```

## Comandi

```bash
pnpm install       # dipendenze
pnpm dev           # app web su http://localhost:3000 (richiede apps/web/.env.local)
pnpm check         # lint + typecheck + test + build di tutto il monorepo
pnpm format        # formattazione Prettier
```

## Documentazione

- Piano tecnico e matrici free tier: [docs/architecture/M0-piano-tecnico.md](docs/architecture/M0-piano-tecnico.md)
- Decisioni architetturali: [docs/decisions/](docs/decisions/README.md)
- Setup e deploy: [docs/operations/setup.md](docs/operations/setup.md)
- Controlli di sicurezza: [docs/operations/security.md](docs/operations/security.md)
- Data dictionary: [docs/data-dictionary/identity.md](docs/data-dictionary/identity.md)

## Branch

| Branch      | Uso                      |
| ----------- | ------------------------ |
| `main`      | produzione stabile       |
| `dev`       | integrazione             |
| `feature/*` | sviluppo, PR verso `dev` |
