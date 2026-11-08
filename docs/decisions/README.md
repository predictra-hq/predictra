# Architecture Decision Records (ADR)

Formato: contesto → decisione → conseguenze. Stato: `Proposta` | `Accettata` | `Sostituita`.
Le motivazioni dettagliate e le fonti sono in [M0-piano-tecnico.md](../architecture/M0-piano-tecnico.md).

| ADR                                                 | Titolo                                                            | Stato     |
| --------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| [0001](0001-monorepo-e-branching.md)                | Monorepo unico e strategia di branch                              | Accettata |
| [0002](0002-hosting-free-tier.md)                   | Hosting a costo zero: Vercel + Supabase + GitHub Actions + QStash | Accettata |
| [0003](0003-coda-su-postgres.md)                    | Coda, lock e dead-letter su Postgres                              | Accettata |
| [0004](0004-fonti-dati-v1.md)                       | Fonti dati per la v1 ed esclusione di football-data.co.uk         | Accettata |
| [0005](0005-mercati-v1.md)                          | Mercati valutabili in v1                                          | Accettata |
| [0006](0006-next-senza-cache-components.md)         | Next.js 16 senza Cache Components (per ora)                       | Accettata |
| [0007](0007-cartella-supabase-e-test-rls.md)        | Cartella `supabase/` e test RLS su Postgres embedded              | Accettata |
| [0008](0008-niente-email-e-deploy-automatico.md)    | Nessuna email e deploy automatico da GitHub Actions               | Accettata |
| [0009](0009-lavoro-in-parallelo.md)                 | Lavoro in parallelo per corsie                                    | Accettata |
| [0010](0010-modello-dati-calcio.md)                 | Modello dati del calcio e ingestion v1                            | Accettata |
| [0015](0015-quote-v1.md)                            | Quote v1: The Odds API, 1X2, regione eu                           | Proposta  |
| [0016](0016-de-margin.md)                           | Margine e probabilità implicite (de-margin)                       | Proposta  |
| [0020](0020-versioning-previsioni.md)               | Versioning e riproducibilità delle previsioni                     | Accettata |
| [0021](0021-modelli-v1.md)                          | Modelli della v1 e mercati derivati                               | Accettata |
| [0022](0022-confidence-score.md)                    | Confidence Score                                                  | Accettata |
| [0025](0025-regole-combinazioni.md)                 | Regole delle combinazioni (Bet Builder)                           | Accettata |
| [0026](0026-correlazioni.md)                        | Correlazioni tra selezioni                                        | Accettata |
| [0027](0027-motore-ranking-categorie.md)            | Motore delle combinazioni, ranking e categorie                    | Accettata |
| [0030](0030-bankroll-dati-e-privacy.md)             | Bankroll: modello dati, limiti personali e privacy                | Proposta  |
| [0031](0031-staking.md)                             | Stake suggerito: flat e Kelly frazionario limitato                | Proposta  |
| [0035](0035-pianificazione-agente.md)               | Pianificazione dell'agente: QStash, GitHub Actions, budget        | Proposta  |
| [0050](0050-deploy-solo-commit-del-proprietario.md) | Deploy solo da commit del proprietario (piano Vercel Hobby)       | Accettata |
