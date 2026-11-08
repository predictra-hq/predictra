# ADR 0025 — Regole delle combinazioni

**Stato:** Proposta (diventa Accettata con il merge della PR di M5 corsia 0) · **Data:** 2026-11-08

## Contesto

- M5 propone combinazioni di selezioni costruite dalle probabilità del modello attivo (M4) e dalle quote reali (M3). Criterio del piano M0 §6: **nessuna schedina forzata**.
- Le quote della v1 sono solo **1X2** (`h2h`, ADR 0015). Gli altri mercati del modello (ADR 0021) hanno probabilità ma non quote: senza quota non c'è EV (piano M0, D5).
- Il Confidence Score (ADR 0022) all'inizio sarà spesso basso, perché lo storico è una sola stagione.

## Decisione

### 1. Tipi di combinazione

| Tipo         | Selezioni                          | Probabilità                                         | In v1                                                                  |
| ------------ | ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `SINGLE`     | 1                                  | quella della previsione                             | ammessa                                                                |
| `MULTIPLE`   | da 2 a `max_legs`, una per partita | prodotto delle probabilità (indipendenza, ADR 0026) | ammessa                                                                |
| `SAME_MATCH` | 2 o più sulla stessa partita       | congiunta dalla matrice dei risultati (ADR 0026)    | **non ammessa**: manca la quota reale della combinazione (ADR 0026 §1) |

- Più selezioni sulla stessa partita sono ammesse **solo se la probabilità congiunta è calcolabile** dalla matrice di M4 **e** se esiste una quota reale della combinazione. Le fonti v1 non la forniscono: il database rifiuta queste proposte finché un nuovo ADR non le abilita.
- Una multipla non mescola gruppi sulla stessa partita e partite diverse.
- Mercati con rimborso (`push_probability` > 0: DNB, linee intere) esclusi in v1: l'EV richiede una formula diversa e non ci sono quote.

### 2. Valori calcolati

Per selezioni `i` con probabilità del modello `pᵢ`, quota reale `oᵢ` e Confidence Score `Cᵢ`:

- probabilità della combinazione `P = Π pᵢ`;
- quota combinata `O = Π oᵢ` (quote reali, nessun aggiustamento);
- valore atteso per unità puntata `EV = P · O − 1`;
- Confidence Score della combinazione `C = min Cᵢ`.

Li calcola il **database** dalle righe referenziate (`predictions`, `odds_snapshots`): il motore indica solo quali selezioni combinare, categoria e posizione. Così nessun numero di una proposta può essere inventato.

### 3. Soglie (valori iniziali)

Salvate in `bet_builder_runs.rules` a ogni esecuzione e verificate dal database per ogni proposta. Codice: `DEFAULT_BET_BUILDER_RULES` in `packages/shared-types/src/bet-builder.ts`.

| Regola                       | Valore | Significato                                                |
| ---------------------------- | ------ | ---------------------------------------------------------- |
| `max_legs`                   | 4      | selezioni al massimo per combinazione                      |
| `min_leg_probability`        | 0,20   | probabilità minima di ogni selezione                       |
| `min_leg_expected_value`     | 0,02   | EV minimo di ogni selezione (`pᵢ · oᵢ − 1`)                |
| `min_probability`            | 0,10   | probabilità minima della combinazione                      |
| `min_expected_value`         | 0,05   | EV minimo della combinazione (deve essere > 0)             |
| `min_confidence_score`       | 0,40   | Confidence Score minimo di ogni selezione (fascia "media") |
| `max_proposals_per_category` | 5      | proposte al massimo per giornata e categoria               |

Altre condizioni, sempre verificate dal database:

- **solo quote FRESH**: ogni quota è l'ultima per bookmaker, mercato ed esito, con qualità `OK`, letta entro il `max_age` di `source_freshness_rules` (12 ore per The Odds API);
- ogni previsione è del **modello attivo** ed è la più recente per partita, mercato, linea ed esito;
- ogni partita è `SCHEDULED` e non ancora iniziata;
- la quota è della stessa partita e dello stesso esito della previsione (1X2 ↔ `h2h`).
- una partita e una squadra compaiono al massimo in una selezione della combinazione (ADR 0026).

### 4. Nessuna schedina forzata

- Se nessuna combinazione supera le soglie, la run si chiude con **zero proposte**. Non si abbassano le soglie per riempire la pagina.
- Le proposte attive sono solo quelle dell'ultima run riuscita: una run con zero proposte azzera la pagina (vista `v_active_bet_proposals`). L'interfaccia mostra lo stato vuoto con l'ora dell'ultima elaborazione (`v_bet_builder_latest_run`).

## Conseguenze

- Con l'ADR 0022 all'inizio molte selezioni avranno Confidence Score < 0,40: **è probabile che per un po' le proposte siano zero**. È il comportamento voluto; le soglie si rivedono con un nuovo ADR dopo i primi dati reali, non a mano.
- Cambiare le soglie non richiede una migrazione (stanno nella run); cambiare il tipo di controllo sì.
- PREDICTRA resta uno strumento informativo: non piazza scommesse (regola 10 di `CLAUDE.md`).
