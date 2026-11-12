# ADR 0028 — Valore prudente e quote solo di bookmaker italiani

**Stato:** Accettata (decisa dal proprietario il 12/11/2026) · **Data:** 2026-11-12 · **Aggiorna:** ADR 0025 (regole), ADR 0027 (motore)

## Contesto

Il 12/11/2026 su DEV ho confrontato, partita per partita, le probabilità del modello attivo con quelle implicite nelle quote. Il controllo era in sola lettura e riguardava le 34 partite del 20–21/11, con 17–22 bookmaker per partita.

- Casa e trasferta erano allineate e i nomi corrispondevano: nessun errore tecnico.
- Su gran parte delle partite modello e mercato concordano, per esempio Bayern–Köln: 85% contro 87%.
- Su alcune partite il modello si discosta molto, di solito perché sottovaluta le grandi favorite o conosce poco le neopromosse:
  - Parma–Roma: Roma al 53% per il modello, al 73% per il mercato;
  - Elversberg–Freiburg: casa al 46% per il modello, al 28% per il mercato.
- Con la sola probabilità del modello, il Bet Builder vedeva in quelle partite un "valore" fino a +150%. Non è credibile.

Inoltre la migliore quota arrivava spesso da bookmaker non disponibili in Italia, per esempio Betfair Exchange, 1xBet o Unibet NL. Il proprietario giocherà solo su bookmaker italiani.

## Decisione

1. **Probabilità usata** per valore atteso, soglie e categorie: `p = (1 − w)·p_modello + w·p_mercato`, con `w = market_weight = 0,5`.
   - `p_mercato` è il consenso de-marginato: per ogni bookmaker con quote 1, X e 2 FRESH si normalizzano le probabilità implicite (metodo proporzionale, ADR 0016), poi si fa la media tra i bookmaker.
   - Il consenso usa **tutti** i bookmaker, anche internazionali: più fonti, stima più stabile.
2. **Quota giocabile:** la migliore tra i soli **bookmaker italiani** (`italian_market`, codici `*_it`, oggi Codere e Unibet Italia), regola `italian_bookmakers_only = true`. Le quote estere servono solo al consenso.
3. **Contratto:**
   - migrazione `20261112020000_bet_builder_market_blend.sql`;
   - `bet_proposal_legs` salva `model_probability` e `market_probability`; `probability` è quella usata;
   - `record_bet_proposals` ricalcola la probabilità usata dal peso della run e dalla probabilità di mercato inviata dal motore;
   - la probabilità di mercato è obbligatoria quando il peso è maggiore di 0 e deve stare in (0, 1);
   - con `italian_bookmakers_only` il database rifiuta le quote di bookmaker non italiani;
   - le run con regole precedenti restano valide: peso 0, tutti i bookmaker.
4. **Regole:** versione `2026.11.12-1`, specchiata in `packages/shared-types/src/bet-builder.ts` e in `services/bet-builder/.../rules.py` (test di coerenza).
5. **Costruttore manuale e schedine dell'app:** stesse regole, in `apps/web/src/lib/bet-builder/market.ts`.

## Conseguenze

- Meno proposte e valori più bassi, ma credibili. Una partita senza quote italiane non entra nelle proposte.
- La probabilità di mercato è calcolata dal motore. Il database ne controlla presenza e limiti e la usa con il peso della run, ma non ricalcola il consenso: è un limite dichiarato.
- "Le più probabili" (pronostici su più mercati) usa ancora la sola probabilità del modello. Per quei mercati non ci sono quote reali gratuite e non c'è valore da calcolare.
- Il calcolatore Kelly del Tracker usa ancora la probabilità del modello: da allineare in una PR successiva.
- **Mercati diversi dall'1X2 (under/over, gol/no gol, doppia chance…) con quote italiane:** il piano gratuito di The Odds API (500 crediti al mese, circa 480 già usati per l'1X2) non basta. La regione `it` non esiste: i bookmaker italiani coperti sono solo Codere e Unibet Italia. Estendere i mercati richiede una scelta del proprietario: ridurre le raccolte 1X2 oppure un piano a pagamento (regola 7).
