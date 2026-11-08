# ADR 0026 — Correlazioni tra selezioni

**Stato:** Proposta (diventa Accettata con il merge della PR di M5 corsia 0) · **Data:** 2026-11-08

## Contesto

Moltiplicare le probabilità di selezioni correlate dà numeri sbagliati: "vince la squadra di casa" e "più di 2,5 gol" sulla stessa partita non sono indipendenti. Il piano M0 §6 chiede: correlazioni gestite, oppure combinazione esclusa.

## Decisione

### 1. Stessa partita → probabilità congiunta dalla matrice di M4

- La probabilità congiunta si calcola dalla matrice dei risultati esatti della stessa versione del modello e dello stesso `as_of` (`prediction_score_matrices`, ADR 0021 §3): `P = Σ matrix[h][a]` sui risultati `h-a` in cui **tutte** le selezioni vincono.
- È calcolabile solo se:
  - ogni selezione è decisa dal solo risultato finale (tutti i mercati di ADR 0021 lo sono);
  - nessuna selezione ha rimborso (`push_probability` > 0);
  - la massa fuori matrice è trascurabile: `1 − Σ matrix ≤ 0,001`, altrimenti la coda dei gol non è nota;
  - le selezioni non sono incompatibili (`P` = 0, es. `HOME` e `AWAY`) né ridondanti (`P` uguale alla probabilità di una sola selezione, es. `HOME` e `HOME_DRAW`).
- **Quota:** per una combinazione sulla stessa partita il prodotto delle quote singole **non** è una quota reale. I bookmaker la quotano a parte (bet builder) o non la accettano. The Odds API v1 non fornisce queste quote, quindi l'EV non è calcolabile: **in v1 il motore non propone combinazioni sulla stessa partita** e il database le rifiuta (`record_bet_proposals`). La probabilità congiunta resta utile nella costruzione manuale (M5 corsia B, fase B3), mostrata **senza EV**.
- Il contratto prevede già il tipo `SAME_MATCH` e il riferimento `score_matrix_id`: abilitarlo richiede un nuovo ADR con una fonte di quote combinate.

### 2. Partite diverse → indipendenza dichiarata

- `P = Π pᵢ`. L'indipendenza è un'**ipotesi**, dichiarata nella spiegazione della proposta (`explanation.correlation = "independence"`) e in interfaccia.
- Ignora fattori comuni (per esempio un errore sistematico del modello sulla stessa lega). Per limitarne l'effetto valgono `max_legs` = 4 e il Confidence Score minimo (ADR 0025).
- Una squadra non può comparire in due selezioni della stessa combinazione (può succedere con recuperi o coppe ravvicinati): combinazione esclusa, lo verifica il database.

### 3. Casi non modellabili → combinazione esclusa

Si esclude, senza proporre alternative, ogni combinazione che contiene:

- mercati non valutabili (corner, cartellini, tiri, giocatori: ADR 0005);
- selezioni sulla stessa partita senza matrice valida o senza quota reale della combinazione;
- selezioni con rimborso in una multipla;
- previsioni di modelli o `as_of` diversi sulla stessa partita.

## Conseguenze

- In v1, con le sole quote 1X2, le proposte sono **singole e multiple su partite diverse**.
- Il calcolo della congiunta sulla stessa partita va scritto una volta in Python (motore, M5 corsia A) e una in TypeScript (valutazione manuale, corsia B), con gli stessi casi di test documentati, come per il de-margin (ADR 0016).
