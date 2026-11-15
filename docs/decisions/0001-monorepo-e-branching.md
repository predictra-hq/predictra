# ADR 0001 — Monorepo unico e strategia di branch

**Stato:** Accettata (approvata il 2026-11-07) · **Data:** 2026-11-07

## Contesto

Il prompt master richiede un monorepo privato `PREDICTRA` e i branch `main` / `develop` / `feature/*`. Il repository `gennpalm/predictra` esiste già, è privato e ha i branch `main` e `dev`.

## Decisione

- Un solo repository con workspaces pnpm (`apps/*`, `services/*`, `packages/*`) e Turborepo per la pipeline TS. I servizi Python (`services/prediction-engine`, `services/data-collector`) sono progetti Python con il proprio `pyproject.toml`.
- `main` = produzione stabile; `dev` = integrazione (svolge il ruolo di `develop`); `feature/*` da `dev`.
- Pull Request obbligatorie verso `dev` e `main`, con CI verde.

## Conseguenze

- Rinominare `dev` in `develop` non serve. La documentazione usa `dev`.
- Le regole di branch protection vanno impostate su GitHub (l'impostazione spetta al proprietario del repo).
