# ADR 0027 — Dove gira il motore, ranking e categorie

**Stato:** Proposta (diventa Accettata con il merge della PR di M5 corsia 0) · **Data:** 2026-11-08

## Contesto

- Budget €0 (regola 7 di `CLAUDE.md`). GitHub Actions: circa 2.000 minuti al mese, già impegnati per raccolte (M2, M3) e motore delle previsioni (circa 220 minuti, ADR 0020 §5). Vercel Hobby: funzioni fino a 300 s, nessun job pianificato utile.
- Le proposte devono essere **versioni immutabili**, con riferimento a modello e quote usati (piano M0 §6).
- Il piano M5 non definisce ranking e categorie: vanno decisi qui.

## Decisione

### 1. Dove gira il motore

| Opzione                                               | Pro                                                                                                                                        | Contro                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Batch Python su GitHub Actions** (scelta)        | stesse librerie e stessa matrice del motore M4; proposte salvate una volta, uguali per tutti; nessuna chiave secret su Vercel per scrivere | qualche minuto di GitHub Actions in più                                                                                                      |
| B. TypeScript lato server su Vercel, a ogni richiesta | nessun minuto di GitHub Actions                                                                                                            | proposte diverse a ogni visita (contrario all'immutabilità), scrittura con chiave secret da Vercel, rischio dei 300 s con molte combinazioni |

- **Scelta: A.** Servizio Python separato `services/bet-builder/` (con `pyproject.toml`, come `services/data-collector`), proprietà di M5 corsia A. Non tocca i file del motore delle previsioni (M4 corsia A, in corso).
- **Quando:** due volte al giorno, alle 07:53 e alle 17:07 UTC, cioè circa mezz'ora dopo le raccolte delle quote (07:23 e 16:37 UTC, workflow _Data collector_). Il motore delle previsioni (M4) gira prima, alle 05:40 e alle 14:40 UTC: così il Bet Builder usa le previsioni più recenti e quote appena lette, senza cambiare l'orario di M4. Si usa uno schedule fisso e non `workflow_run`, perché `workflow_run` partirebbe anche dopo ogni raccolta football-data (ogni 3 ore). Stima: circa 1 minuto per run, **circa 60 minuti al mese**, da verificare con le prime esecuzioni. Se il budget non basta, si fa una sola run al giorno.
- **Scrittura:** solo con le funzioni `start_bet_builder_run`, `record_bet_proposals`, `finish_bet_builder_run` (`service_role`).
- **Valutazione manuale** (corsia B, fase B3): calcolo in TypeScript lato server, leggero (una combinazione alla volta, ben sotto i 300 s), con le formule di `packages/shared-types/src/bet-builder.ts`. Non salva proposte: al più una schedina privata dell'utente.

### 2. Ranking

Per ogni combinazione con probabilità `P`, quota `O`, `EV = P · O − 1` e Confidence Score `C`:

```text
σ = O · √(P · (1 − P))          deviazione standard del ritorno per unità puntata
rank_score = C · EV / σ
```

- Premia il valore atteso, lo pesa con la fiducia nella stima e penalizza la varianza (le multiple lunghe con quote alte).
- Spareggi, in ordine: probabilità più alta, meno selezioni, id della previsione più basso.
- `rank` è la posizione (1 = migliore) **per giornata e categoria**; `rank_score` è salvato nella proposta.
- Funzione di riferimento: `rankScore` in `packages/shared-types/src/bet-builder.ts`, con i casi di test documentati.

### 3. Categorie (profilo di rischio)

Dalla probabilità della combinazione `P`:

| Categoria      | Etichetta in interfaccia | Probabilità       |
| -------------- | ------------------------ | ----------------- |
| `CONSERVATIVE` | Prudente                 | `P` ≥ 0,50        |
| `BALANCED`     | Equilibrata              | 0,25 ≤ `P` < 0,50 |
| `AGGRESSIVE`   | Aggressiva               | 0,10 ≤ `P` < 0,25 |

Il limite inferiore 0,10 è `min_probability` (ADR 0025). Per ogni giornata e categoria si salvano al massimo `max_proposals_per_category` proposte (5). Una giornata è la data, nel fuso Europe/Rome, del primo calcio d'inizio della proposta (`slate_date`).

### 4. Versioni

- Ogni run registra modello, commit del codice e regole usate (`bet_builder_runs`). Ogni proposta e ogni selezione sono immutabili e puntano a previsione e quota usate, con una copia dei valori del momento.
- Le proposte attive sono quelle dell'ultima run riuscita, del modello attivo, con il primo calcio d'inizio ancora da venire. Le precedenti restano come storico.

## Conseguenze

- Le proposte cambiano solo due volte al giorno: tra una run e l'altra quote e freschezza possono cambiare. La vista `v_bet_proposal_legs` mostra quota e freschezza attuali; `v_active_bet_proposals` conta le selezioni con quota STALE o cambiata, per l'avviso in interfaccia.
- Pesi e categorie sono iniziali: si rivedono con un nuovo ADR dopo i primi dati reali.
