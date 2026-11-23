# ADR 0066 — Versione del sito automatica per ambiente

- **Stato:** accettato (23/11/2026)
- **Milestone:** M8
- **Sostituisce:** la regola manuale delle versioni (`docs/operations/interfaccia.md`, 18/11/2026)

## Contesto

Il numero di versione si alzava a mano in `apps/web/package.json`: l'ultima cifra su `dev`, la cifra di mezzo al passaggio in produzione. Il 23/11/2026 diversi commit su `dev` erano arrivati in produzione senza alzarlo. Il proprietario vuole che ogni deploy, su DEV e su PROD, abbia il suo numero senza doverci pensare.

Un commit automatico di versione non va bene: farebbe ripartire le pipeline (ADR 0061, minuti limitati) e su `main` si pubblicano solo commit del proprietario (ADR 0050).

## Decisione

Il numero si calcola al deploy dalla storia git (`scripts/release/version.sh`) e arriva alla build come `APP_RELEASE`:

- **PROD:** `MAGGIORE.(MINORE base + merge su main dopo la base).0`, dove i merge sono i commit di `main` in prima linea;
- **DEV:** `MAGGIORE.(minore di PROD).(commit di dev non ancora su main)`.

La base è in `apps/web/release.json`: PROD 1.4.0 nel merge `55f8fa2` (PR #133). Il checkout del deploy prende tutta la storia (`fetch-depth: 0`): pochi secondi, perché la storia riparte dal 15/11/2026.

## Conseguenze

- Ogni merge su `main` alza PROD di una cifra di mezzo. Ogni push su `dev` alza DEV di un'ultima cifra, che torna a 0 dopo il merge.
- `apps/web/package.json` non decide più la versione pubblicata: resta il numero mostrato in locale.
- La prima cifra si cambia aggiornando `release.json` con una nuova base, per decisione del proprietario.
