# ADR 0021 — Modelli della v1 e mercati derivati

**Stato:** Accettata (PR #17; verificata con la chiusura di M4, 8/11/2026) · **Data:** 2026-11-08

## Contesto

- Con le fonti gratuite ci sono solo i risultati (ADR 0005). I modelli della v1 si basano sui gol.
- Storico disponibile: la stagione in corso delle 8 competizioni (M2). Lo storico 2022–2024 di API-Football è bloccato dai termini (M2 fase A3).

## Decisione

### 1. Modelli

| `model_key`   | Cosa fa                                                                                          | Ruolo                                             |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `baseline`    | frequenze di 1/X/2 e dei gol per lega, calcolate sullo storico disponibile                       | riferimento minimo: ogni modello deve fare meglio |
| `elo`         | rating Elo per squadra con vantaggio casalingo; probabilità 1X2 da un modello ordinale calibrato | modello leggero, robusto con pochi dati           |
| `poisson`     | gol casa e ospite come Poisson indipendenti, con forze d'attacco e difesa e vantaggio casalingo  | matrice dei risultati esatti                      |
| `dixon_coles` | Poisson con correzione `rho` sui punteggi bassi e pesi decrescenti nel tempo                     | candidato principale                              |

### 2. Mercati derivati dalla matrice dei risultati esatti

Codici in `packages/shared-types/src/predictions.ts`.

| Mercato             | Selezioni                                            | Linea                                         | Note                                                                                                                                      |
| ------------------- | ---------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `1X2`               | `HOME`, `DRAW`, `AWAY`                               | —                                             | corrisponde a `h2h` delle quote (M3)                                                                                                      |
| `DOUBLE_CHANCE`     | `HOME_DRAW`, `HOME_AWAY`, `DRAW_AWAY`                | —                                             |                                                                                                                                           |
| `DNB`               | `HOME`, `AWAY`                                       | —                                             | `push_probability` = pareggio                                                                                                             |
| `TOTAL_GOALS`       | `OVER`, `UNDER`                                      | x,5 o intera                                  | linea intera: `push_probability`                                                                                                          |
| `BTTS`              | `YES`, `NO`                                          | —                                             |                                                                                                                                           |
| `TEAM_GOALS`        | `HOME_OVER`, `HOME_UNDER`, `AWAY_OVER`, `AWAY_UNDER` | x,5 o intera                                  |                                                                                                                                           |
| `CORRECT_SCORE`     | `h-a` (es. `2-1`) e `OTHER`                          | —                                             |                                                                                                                                           |
| `EUROPEAN_HANDICAP` | `HOME`, `DRAW`, `AWAY`                               | intera (handicap della squadra di casa)       |                                                                                                                                           |
| `ASIAN_HANDICAP`    | `HOME`, `AWAY`                                       | x,0 o x,5 (prospettiva della squadra di casa) | linea intera: `push_probability`. Le linee a quarti (x,25 / x,75) non si salvano: si ottengono in M5 come media delle due linee adiacenti |

- `probability` è la probabilità di vincita piena.
- `push_probability` è la probabilità di rimborso, solo dove esiste.
- Le probabilità di un mercato e di una linea sommano a 1, includendo il push: il test del motore lo verifica.
- I mercati non valutabili (corner, cartellini, tiri, giocatori) non si salvano (ADR 0005).

### 3. Matrice dei risultati esatti

- Per `poisson` e `dixon_coles` si salvano i parametri (`lambda_home`, `lambda_away`, `rho`) e la matrice fino a 10 gol per squadra (`prediction_score_matrices`).
- Serve a M5 per le probabilità congiunte sulla stessa partita.

### 4. Modello attivo

- In ogni momento **al più una** versione è `ACTIVE`. È quella mostrata come "previsione PREDICTRA".
- Una versione può diventare attiva solo se ha un backtest registrato con Brier score e Log Loss migliori della baseline sullo stesso periodo. Il controllo è nel database.
- L'attivazione la fa un Super Admin (permesso `models.manage`, `roles.ts`) con 2FA, tramite `set_active_model_version`. L'operazione è registrata in audit; la versione attiva precedente passa a `RETIRED`.

## Conseguenze

- Con una sola stagione di dati, la calibrazione all'inizio sarà debole: il Confidence Score (ADR 0022) lo deve riflettere.
- Le probabilità vengono solo da questi modelli, mai da un LLM (regola 5 di `CLAUDE.md`).
