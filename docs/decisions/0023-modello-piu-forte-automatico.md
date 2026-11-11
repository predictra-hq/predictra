# ADR 0023 — Versioni stabili e modello più forte attivato in automatico

**Stato:** Accettata (richiesta del proprietario, 11/11/2026; si accetta con il merge) · **Data:** 2026-11-11 · **Milestone:** M4 · **Modifica:** ADR 0020 (identità della versione) e ADR 0021 §4 (attivazione)

## Contesto

Il controllo del sito dell'11/11/2026 ha trovato un problema nascosto:

- la versione di un modello includeva il commit dell'intero servizio `services/prediction-engine` (ADR 0020, precisazione dell'8/11);
- il commit `840b22c` (8/11), che aggiungeva solo il comando di diagnosi, ha quindi creato quattro versioni nuove (#5–#8);
- il motore scrive le previsioni nelle versioni del commit corrente, mentre il sito mostra solo quelle della versione **attiva**, rimasta la #3 del commit precedente.

Alla ripresa delle partite, dopo la sosta per le nazionali, dashboard, dettaglio partita e Bet Builder sarebbero rimasti vuoti finché un Super Admin non avesse attivato a mano la versione nuova. Ogni modifica al motore, anche solo alla documentazione del servizio, avrebbe ripetuto il problema.

Il proprietario chiede che il modello attivo sia sempre il più forte e che il motore non crei versioni nuove senza motivo.

## Decisione

1. **Versione = famiglia + iperparametri + impronta del codice dei modelli.** L'impronta è lo SHA-256 dei sorgenti che producono i numeri:
   - `models/` (i modelli);
   - `data.py` (i dati in ingresso);
   - `markets.py` (i mercati derivati);
   - `confidence.py` (il Confidence Score).

   Il calcolo è in `selection.py`, con il contenuto normalizzato agli a capo Unix. Modifiche a diagnosi, comandi, orchestrazione, workflow o documentazione non creano più versioni. Il commit git resta registrato in ogni versione, backtest ed esecuzione: la riproducibilità dell'ADR 0020 non cambia.

2. **Il modello più forte diventa attivo da solo.** A ogni esecuzione il motore confronta le versioni del codice corrente che battono la baseline nel backtest walk-forward (Brier **e** Log Loss migliori, come richiede l'ADR 0021 §4). Sceglie quella con il **Log Loss più basso**; a parità di Log Loss, quella con il Brier più basso. Il Log Loss è la regola di punteggio che premia di più le probabilità ben calibrate. La versione scelta diventa attiva se:
   - non c'è un modello attivo;
   - il modello attivo appartiene a un codice superato, quindi non riceve più previsioni;
   - batte il modello attivo di almeno **0,001** di Log Loss. Il margine evita cambi continui tra modelli quasi equivalenti.
3. **Funzione nel database:** `auto_activate_model_version(id, motivo)`, eseguibile solo da `service_role` (migrazione `20261111190000_auto_activate_model.sql`).
   - Ricontrolla la condizione sulla baseline.
   - Ritira la versione precedente; resta al più una versione attiva.
   - Registra in audit `model.auto_activated`, con la versione precedente e il motivo.
   - `activated_by` resta vuoto: l'attivazione è del sistema.
4. **Attivazione manuale:** resta possibile per un Super Admin con 2FA (`set_active_model_version`). Il motore la cambia solo se trova un modello più forte secondo il punto 2.

Il backtest usa tutto lo storico disponibile, compreso quello di API-Football 2022–2024: più partite rendono il confronto più affidabile. Misura sull'hardware di sviluppo con circa 13.000 partite: meno di un secondo per i quattro modelli per ogni settimana di backtest, quindi pochi minuti, dentro il lease di 15 minuti dell'agente. Il backtest si ripete solo quando nasce una versione nuova.

## Conseguenze

- Con il merge, l'impronta sostituisce il commit nelle etichette: nasce **una** nuova serie di versioni, l'ultima per un motivo non legato ai modelli. Alla prima esecuzione il motore fa il backtest e attiva da solo la versione più forte, che sostituisce la #3, ferma all'8/11.
- Le versioni future nascono solo quando cambia il codice che produce i numeri. Il modello migliore del nuovo codice prende il posto di quello attivo senza interventi manuali.
- Nel log di ogni esecuzione: `codice dei modelli: <impronta>` e `modello più forte attivato: …` oppure `modello attivo confermato`.
- La pagina _Audit_ mostra le attivazioni automatiche (`model.auto_activated`) accanto a quelle manuali.
- Test: `services/prediction-engine/tests/test_selection.py` e `test_pipeline.py`; `supabase/tests/predictions.test.ts`.
