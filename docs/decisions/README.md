# Architecture Decision Records (ADR)

Formato: contesto → decisione → conseguenze. Stato: `Proposta` | `Accettata` | `Sostituita`.
Le motivazioni dettagliate e le fonti sono in [M0-piano-tecnico.md](../architecture/M0-piano-tecnico.md).

| ADR                                          | Titolo                                                            | Stato     |
| -------------------------------------------- | ----------------------------------------------------------------- | --------- |
| [0001](0001-monorepo-e-branching.md)         | Monorepo unico e strategia di branch                              | Accettata |
| [0002](0002-hosting-free-tier.md)            | Hosting a costo zero: Vercel + Supabase + GitHub Actions + QStash | Accettata |
| [0003](0003-coda-su-postgres.md)             | Coda, lock e dead-letter su Postgres                              | Accettata |
| [0004](0004-fonti-dati-v1.md)                | Fonti dati per la v1 ed esclusione di football-data.co.uk         | Accettata |
| [0005](0005-mercati-v1.md)                   | Mercati valutabili in v1                                          | Accettata |
| [0006](0006-next-senza-cache-components.md)  | Next.js 16 senza Cache Components (per ora)                       | Accettata |
| [0007](0007-cartella-supabase-e-test-rls.md) | Cartella `supabase/` e test RLS su Postgres embedded              | Accettata |
