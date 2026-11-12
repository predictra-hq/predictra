# ADR 0024 — Un modello PREDICTRA e uno sfidante

**Stato:** Accettata (richiesta del proprietario, 11/11/2026; si accetta con il merge) · **Data:** 2026-11-11 · **Milestone:** M4 · **Modifica:** ADR 0021 (modelli della v1) e ADR 0023

## Contesto

L'11/11/2026 la pagina _Model Intelligence_ elencava 12 versioni: 4 famiglie (baseline, Elo, Poisson, Dixon-Coles) per 3 versioni del codice. Il proprietario chiede pochi modelli che migliorino nel tempo, anche uno solo, invece di un elenco che cresce.

Fatti verificati:

- tutti i modelli si **riaddestrano a ogni esecuzione** (due volte al giorno) su tutte le partite fino a quel momento, quindi migliorano già con ogni partita giocata;
- solo **Poisson** e **Dixon-Coles** calcolano tutti i mercati: 1X2, gol, risultato esatto. Il Bet Builder ne ha bisogno. Baseline ed Elo calcolano solo l'1X2;
- la baseline serve come riferimento: un modello si attiva solo se la batte (ADR 0021 §4);
- Elo, con un approccio diverso, dà un parere indipendente all'accordo tra modelli del Confidence Score (ADR 0022).

## Decisione

1. **In gara solo Poisson e Dixon-Coles** (`CONTENDERS` in `selection.py`). Uno è il **modello PREDICTRA** attivo, l'altro lo **sfidante**. La scelta resta quella dell'ADR 0023: confronto settimanale e Log Loss più basso tra chi batte la baseline.
2. **Baseline ed Elo diventano strumenti interni** del motore:
   - si addestrano e si valutano a ogni esecuzione: la baseline nel backtest come riferimento, Elo nell'accordo del Confidence Score;
   - non si registrano più come versioni e non scrivono previsioni.
3. **Le versioni superate si ritirano da sole.** A ogni esecuzione il motore chiama `retire_superseded_model_versions(keep)`:
   - le versioni candidate fuori dal codice corrente o fuori gara diventano `RETIRED`;
   - la versione attiva la cambia solo l'attivazione;
   - audit `model.versions_retired`;
   - migrazione `20261111210000_retire_superseded_models.sql`.

   Le versioni ritirate e le loro previsioni restano nel database per la riproducibilità (ADR 0020).

   **Cambio del modello attivo (aggiornamento del 12/11/2026).** Quando un modello prende il posto dell'attivo, a mano (`set_active_model_version`) o in automatico (`auto_activate_model_version`), il precedente torna `CANDIDATE`, cioè sfidante, e non `RETIRED`. Così resta in gara e si può riattivare. Su DEV attivare a mano Dixon-Coles aveva ritirato Poisson, che non si poteva più riattivare. `RETIRED` vale solo per le versioni superate, decise dal motore. La migrazione `20261112000000_model_activation_reversible.sql` ha anche rimesso in gara l'ultima versione di Poisson e di Dixon-Coles. Un'attivazione manuale vale fino al ciclo successivo del motore: se l'altro modello è più forte di almeno 0,001 di Log Loss, torna attivo da solo (ADR 0023).

4. **Pagina _Model Intelligence_:**
   - in primo piano il modello attivo, con il riferimento della baseline;
   - una tabella "In gara" con il modello attivo e lo sfidante;
   - lo storico delle versioni ritirate in una sezione chiusa.

## Come migliora nel tempo

- **A ogni esecuzione:** il modello attivo si riaddestra su tutte le partite, comprese le ultime giocate e lo storico di API-Football.
- **Ogni settimana:** nuovo backtest dei due modelli sui dati aggiornati; se lo sfidante diventa più forte, prende il posto dell'attivo (ADR 0023).
- **Quando cambia il codice dei modelli:** nuove versioni dei due modelli, scelta del migliore, le vecchie si ritirano. L'elenco resta di due.

## Conseguenze

- Al primo giro dopo il merge si ritirano le versioni esistenti: quelle di Elo, della baseline e quelle del codice precedente.
- Meno righe in `predictions`: solo i due modelli in gara invece di quattro.
- Test: `services/prediction-engine/tests/test_pipeline.py` (`test_in_gara_solo_poisson_e_dixon_coles` e il ritiro delle versioni superate) e `supabase/tests/predictions.test.ts`.
