# ADR 0007 — Cartella `supabase/` e test RLS su Postgres embedded

**Stato:** Accettata · **Data:** 2026-11-07

## Contesto

Il prompt master suggerisce `database/migrations` e `tests/…`. La Supabase CLI si aspetta invece `supabase/migrations`. Docker non è installato in locale, e i test RLS devono comunque girare in locale e in CI senza costi.

## Decisione

- Migrazioni, template email e test del database in `supabase/` (workspace `@predictra/database`), per compatibilità diretta con `supabase db push`.
- Test di migrazione e RLS su **PGlite** (Postgres in WASM) con un'emulazione minima di Supabase: schema `auth`, `auth.uid()` e `auth.jwt()`, ruoli `anon`, `authenticated` e `service_role`, privilegi di default.
- I test unitari restano accanto al codice (`*.test.ts`). La cartella `tests/` alla radice ospiterà i test end-to-end e di backtesting nelle milestone successive.

## Conseguenze

- Le migrazioni vengono riapplicate da zero a ogni test (riproducibilità verificata).
- L'emulazione non copre tutto Supabase (GoTrue, PostgREST). Il flusso Auth completo va verificato su staging con la checklist in `docs/operations/setup.md`. Un job CI con `supabase start` (Docker) potrà essere aggiunto se i minuti lo consentono.
