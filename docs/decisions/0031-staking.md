# ADR 0031 — Stake suggerito: flat e Kelly frazionario limitato

**Stato:** Accettata (PR #25; verificata con la chiusura di M6, 8/11/2026) · **Data:** 2026-11-08

## Contesto

Il tracker può suggerire quanto puntare. Il suggerimento è solo informativo: PREDICTRA non piazza scommesse. Il criterio di Kelly pieno è troppo aggressivo con probabilità stimate e incerte, quindi serve una versione prudente.

## Decisione

Per un bankroll con saldo disponibile `B`:

- **Flat:** `stake = B × percentuale`, con percentuale predefinita **1%**, configurabile dall'utente tra 0,1% e 5%.
- **Kelly frazionario limitato,** solo quando esiste una probabilità del **modello attivo** (M4) e una quota reale `o`:
  - frazione di Kelly: `f* = (p · o − 1) / (o − 1)`;
  - `stake = B × min(0,25 · f*, 2%)`: un quarto di Kelly, con tetto al 2% del disponibile;
  - se `f* ≤ 0` (valore atteso non positivo) lo stake suggerito è **0**: nessuna giocata consigliata.
- **Probabilità mancante:** niente Kelly, si mostra solo il flat, con il motivo.
- Il suggerimento rispetta sempre i limiti personali (ADR 0030): non supera mai `max_stake` né il disponibile.
- Le funzioni stanno in `packages/bankroll` (M6 corsia A), con test calcolati a mano.

Esempio documentato: `p = 0,55`, `o = 2,00`, `B = 1.000 €`. Allora `f* = (1,10 − 1) / 1 = 0,10`, un quarto di Kelly vale 0,025, il tetto è 0,02: stake suggerito **20 €**.

## Conseguenze

- Il tetto del 2% domina spesso: è voluto, data l'incertezza delle probabilità (Confidence Score, ADR 0022).
- Frazione e tetto si potranno rivedere con lo storico reale delle giocate, con un nuovo ADR.
