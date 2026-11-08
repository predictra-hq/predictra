# ADR 0016 — Margine e probabilità implicite (de-margin)

**Stato:** Proposta (diventa Accettata con il merge della PR di M3 corsia 0) · **Data:** 2026-11-07

## Contesto

Le quote dei bookmaker contengono un margine: la somma delle probabilità implicite supera 1. Per confrontarle con le probabilità dei modelli (M4) e calcolare EV e fair odds (M5) serve togliere il margine. Il risultato dipende dal metodo scelto.

## Decisione

Per un mercato con quote decimali `o₁ … oₙ` (in v1: 1X2, n = 3):

- **Probabilità implicita grezza:** `qᵢ = 1 / oᵢ`.
- **Overround (margine):** `Σ qᵢ − 1`. Si mostra in percentuale.
- **Metodo proporzionale (predefinito):** `pᵢ = qᵢ / Σ qⱼ`.
  - È il metodo mostrato in interfaccia, calcolato anche nelle viste SQL (`v_match_odds_h2h`).
  - È quello usato dalle milestone successive, salvo indicazione diversa.
- **Metodo della potenza (secondo metodo):** `pᵢ = qᵢᵏ`, con `k` tale che `Σ qᵢᵏ = 1`.
  - Si trova `k` per bisezione.
  - Attribuisce più margine agli esiti meno probabili, cioè gestisce il favourite–longshot bias.
  - Si calcola nel pacchetto `packages/quant` (M3 corsia A) e si può mostrare come confronto.
- **Quota equa (fair odds):** `1 / pᵢ`.
- **Validità:** un mercato si calcola solo se tutte le selezioni hanno una quota `> 1`. Un 1X2 senza pareggio non si calcola.
- Le funzioni di `packages/quant` hanno test con casi calcolati a mano e documentati nel test. Se serviranno anche in Python (M4, M5), si replicano con gli stessi casi.

Esempio documentato (usato anche nei test SQL), con quote 2,00 / 3,40 / 4,00:

|               | Casa     | Pareggio | Ospite   | Somma    |
| ------------- | -------- | -------- | -------- | -------- |
| `1/o`         | 0,500000 | 0,294118 | 0,250000 | 1,044118 |
| Proporzionale | 0,478873 | 0,281690 | 0,239437 | 1        |

Overround = 4,41%.

## Conseguenze

- Le probabilità dalle quote sono sempre etichettate come "implicite (senza margine, metodo proporzionale)": non sono previsioni di PREDICTRA. Le previsioni vengono solo dai modelli di M4 (regola 5 di `CLAUDE.md`).
- Il metodo Shin non c'è in v1. Si può aggiungere in `packages/quant` con un nuovo ADR.
