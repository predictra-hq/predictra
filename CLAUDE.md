# PREDICTRA — istruzioni per chi sviluppa (persone e agenti)

Piattaforma privata di football intelligence. Specifica completa: il "Prompt Master" fornito dal proprietario, riassunto e vincolato da `docs/architecture/M0-piano-tecnico.md` e dagli ADR in `docs/decisions/`. Lingua del prodotto e della documentazione: **italiano**.

## Stato

**Dove siamo e cosa fare dopo:** `docs/operations/punto-della-situazione.md`.

| Milestone                                                                 | Stato                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Audit e piano                                                          | ✅                                                                                                                                                                                        |
| M1 Fondazioni (auth su invito senza email, ruoli, 2FA, RLS, admin, CI/CD) | ✅ in servizio su DEV (https://predictra-dev.vercel.app); ambienti: `docs/operations/ambienti.md`                                                                                         |
| M2 Football data                                                          | ✅ in servizio su DEV: contratto, collector `services/data-collector`, Match Center e Data Center. Fase A3 (API-Football) bloccata dai termini d'uso: `docs/data-sources/api-football.md` |
| **M3 Statistiche e quote**                                                | 🔄 corsie 0 e A fatte (quote reali su DEV); prossima: **corsia B** (Market, Statistics e League Intelligence, pagina alias). Dettagli: `docs/operations/punto-della-situazione.md`        |
| M5 Smart Bet Builder                                                      | ✅ in servizio su DEV: contratto, motore `services/bet-builder` (workflow _Bet Builder_), pagine `/bet-builder`. ADR 0025–0027. Proposte reali quando c'è un modello M4 attivo            |
| M4, M6–M8                                                                 | M4 in corso, M6 può partire; piani in `docs/roadmap/`                                                                                                                                     |

## Lavoro in parallelo (leggere prima di iniziare)

Più persone lavorano contemporaneamente, ognuna con il proprio Claude Code. Regole complete: `docs/operations/collaborazione.md` (ADR 0009).

- All'inizio della sessione identifica **milestone e corsia** (0 = contratto, A = dati/backend, B = interfaccia). Se non sono chiare, chiedile prima di scrivere codice.
- Leggi il piano della milestone in `docs/roadmap/` e tocca **solo i file della tua corsia**. Se serve modificare un file di un'altra corsia o il contratto, fermati e segnalalo: si fa con una PR dedicata.
- Branch `feature/m<N>-<0|a|b>-<slug>` da `dev` aggiornato; PR piccole verso `dev` con il modello `.github/pull_request_template.md`.
- Migrazioni: timestamp successivo all'ultimo già su `dev` al momento del merge, altrimenti il deploy si ferma.

## Regole vincolanti (dal Prompt Master)

1. Procedi per fasi piccole e verificabili. Prima di ogni fase dichiara obiettivo, file, dipendenze e criteri di completamento.
2. Dopo ogni fase `pnpm check` deve essere verde. Non dichiarare finita una funzione che è solo un mockup.
3. **Mai dati inventati.** Niente quote, risultati, statistiche, fonti o endpoint inventati. I dati demo devono essere etichettati `DEMO`.
4. Ogni dato esterno conserva provider, ID provider, `observed_at`, `event_time`, qualità e licenza. Ogni previsione è riproducibile e versionata.
5. Le probabilità vengono da modelli quantitativi, **mai** da un LLM.
6. Mai segreti nel codice, nei log o nel frontend. Le chiavi privilegiate non hanno mai il prefisso `NEXT_PUBLIC_`.
7. Budget **€0**: nessun servizio a pagamento senza approvazione esplicita del proprietario. Se il piano free non basta, dichiara il limite e degrada in modo controllato.
8. Rispetta licenze e termini dei provider. Niente scraping non autorizzato. `football-data.co.uk` è **escluso** (ADR 0004).
9. Non cancellare né riscrivere funzionalità esistenti senza averle capite e senza autorizzazione.
10. La piattaforma **non invia email** e non piazza scommesse.

## Comandi

```bash
pnpm install
pnpm check                              # lint + typecheck + test + build (turbo)
pnpm format && pnpm format:check        # Prettier (verificato in CI)
pnpm --filter @predictra/database test  # migrazioni + RLS su Postgres embedded (PGlite)
pnpm --filter web dev                   # app locale (richiede apps/web/.env.local)
```

## Struttura e convenzioni

- `apps/web`: Next.js **16.4**. Leggi `apps/web/AGENTS.md` e la documentazione in `apps/web/node_modules/next/dist/docs/` prima di usare le API di Next: sono cambiate (`proxy.ts` al posto di `middleware`, `PageProps`/`LayoutProps` globali). Cache Components disattivato (ADR 0006).
- **Autorizzazione:**
  - lato server tramite `src/lib/auth/dal.ts` (`requireUser`, `requirePermission`) in ogni pagina e Server Action;
  - nel database tramite RLS e RPC `SECURITY DEFINER` che ricontrollano ruolo, stato e `aal2`.

  Il client con chiave segreta (`lib/supabase/admin.ts`) si usa solo dopo che una RPC ha autorizzato l'operazione.

- Ruoli e permessi: `packages/shared-types/src/roles.ts`, specchiati in SQL. Le modifiche vanno fatte in entrambi i posti, con i relativi test.
- Testi UI: solo in `src/lib/i18n/it.ts`.
- **Database:**
  - una nuova migrazione è un **nuovo file** `supabase/migrations/<timestamp>_<nome>.sql`. Le migrazioni già applicate non si modificano;
  - ogni tabella con dati utente ha RLS e test in `supabase/tests/`;
  - i dati personali (bankroll, puntate) **non** sono visibili agli admin.
- Impostazioni Auth di Supabase: `supabase/config.toml` (applicato dalla pipeline; dichiara solo ciò che vuoi controllare).
- Python (M2+): servizi in `services/<nome>/` con `pyproject.toml`.
- Si lavora soprattutto in cloud (Claude Code sul web): non dare per scontati strumenti installati sulle macchine del team. Controlli, test, migrazioni e deploy girano su GitHub Actions.

## Flusso Git e deploy

- `main` = produzione, `dev` = integrazione, `feature/*` = sviluppo con PR verso `dev`. La protezione dei branch non è disponibile (GitHub Free, repo privato): rispetta il flusso a mano.
- Merge su `dev` e su `main` solo da `gennpalm`, con **Create a merge commit** e CI verde: sul piano Vercel Hobby si pubblicano solo commit del proprietario e il deploy lo verifica (ADR 0050). Niente push diretti su `dev` o `main`.
- Si lavora **solo su branch `feature/*`**. Dopo il merge GitHub cancella il branch da solo: nella pagina _Branches_ restano `main`, `dev` e il lavoro non ancora unito. Un branch `feature/*` esistente significa lavoro non ancora in `dev`. Dopo un merge si riparte da `dev` aggiornato con un branch nuovo.
- Push su `dev` con CI verde → deploy automatico: migrazioni Supabase, config Auth, Vercel (`.github/workflows/ci.yml` + `deploy-target.yml`). `dev` deve restare sempre verde.
- I workflow avviabili a mano (es. _Bootstrap Super Admin_) compaiono in _Actions_ solo se il file è anche su `main`.
- Commit in italiano, descrittivi. Non fare push di modifiche con `pnpm check` rosso.

## Documentazione da aggiornare insieme al codice

`README.md`, `docs/roadmap/` (stato e assegnazione delle corsie), `docs/operations/setup.md`, `docs/operations/ambienti.md` (ambienti, segreti, scadenze), `docs/operations/security.md`, `docs/data-dictionary/`, e un nuovo ADR in `docs/decisions/` per ogni scelta architetturale.
