# ADR 0079 — Elo unico su tutte le competizioni nel modello PREDICTRA

- **Stato:** accettato (27/11/2026)
- **Milestone:** M8 (corsia A, motore di previsione)
- **Aggiorna:** ADR 0039 (Dixon-Coles + Elo), ADR 0074 (modello gol unico), ADR 0076 e 0078 (soglia di decisione delle schedine)

## Contesto

Il proprietario chiede un modello più preciso per ridurre le schedine perse, a costo zero. L'Elo del modello PREDICTRA era separato per competizione: in Champions League una squadra contava solo le poche partite europee, e il suo campionato non serviva. Il modello gol aveva già risolto lo stesso problema con il modello unico (ADR 0074), l'Elo no. Due idee mai provate prima (runbook del motore, «Prove sull'Elo»): un Elo unico per squadra su tutte le competizioni e i pi-ratings di Constantinou e Fenton (2013), con valutazioni in casa e in trasferta corrette sull'errore dello scarto gol.

## Misura

Comando `ratings` (sola lettura, _Actions → Prediction engine → Run workflow_, `command = ratings`): backtest walk-forward settimanale dal 1/7/2024, **3.517 partite** mai viste, stesse partite per tutti; differenza di Log Loss 1X2 dal modello attivo, partita per partita, ± 2 errori standard. Run del 27/11/2026: [prima prova](https://github.com/predictra-hq/predictra/actions/runs/45973643398), [seconda prova](https://github.com/predictra-hq/predictra/actions/runs/45974232736).

| Variante                                                     | Tutte                | 2024-25          | 2025-26          |
| ------------------------------------------------------------ | -------------------- | ---------------- | ---------------- |
| Elo per competizione, da solo (Log Loss)                     | 0,9864               |                  |                  |
| Elo unico, da solo (Log Loss)                                | 0,9811               |                  |                  |
| Pi-ratings, da soli (Log Loss)                               | 0,9905               |                  |                  |
| Attivo + pi-ratings 0,15                                     | −0,0003 ± 0,0009     |                  |                  |
| **Attivo con Elo unico al posto di quello per competizione** | **−0,0017 ± 0,0013** | −0,0022 ± 0,0015 | −0,0002 ± 0,0028 |
| Stesso, peso dell'Elo 0,5                                    | −0,0019 ± 0,0016     | −0,0022 ± 0,0018 | −0,0009 ± 0,0033 |

Il controllo «attivo ricostruito» dalle componenti dà esattamente il modello attivo (differenza 0,0000): il confronto è corretto. Il guadagno c'è in quasi ogni campionato; solo la Champions League 2025-26 (90 partite) peggiora un poco, dentro il rumore.

## Decisione

1. **Il modello PREDICTRA usa l'Elo unico** (`Elo(scope="all")`, `models/ratings.py`), con lo stesso peso 0,4 e il resto invariato. Il miglioramento supera sia il minimo di 0,001 sia due errori standard, come chiede la taratura automatica (ADR 0078), ed è della stessa grandezza di quello che ha portato al modello unico dei gol (ADR 0074).
2. **Riproducibilità (ADR 0020):** negli iperparametri compare `"scope": "all"` solo per l'Elo unico, quindi le versioni già salvate non cambiano; con ogni versione si salvano, per competizione, le valutazioni Elo delle sue squadre. La taratura automatica e la ricostruzione dalla versione salvata conservano l'Elo unico.
3. **Versione nuova, attivazione automatica:** gli iperparametri nuovi creano una versione nuova del modello `dixon_coles`, che fa il suo backtest sul database e si attiva da sola se batte quella attiva (ADR 0023).
4. **Pi-ratings non adottati:** da soli sono peggiori dell'Elo e in combinazione non aggiungono nulla. Restano nel comando `ratings`.
5. **Soglia di decisione delle schedine:** 200 partite decise invece di 300, poi di nuovo ogni 100 (scelta del proprietario del 26/11/2026; ADR 0076 e 0078 aggiornati).

## Conseguenze

- Previsioni un po' più precise, soprattutto nelle coppe europee e nei campionati con squadre che giocano anche in Europa. Il guadagno medio è piccolo (circa 0,002 di Log Loss): con i soli risultati il modello resta vicino al suo limite, e le quote del mercato contengono ancora informazioni che il modello non ha.
- Sulle schedine l'effetto è piccolo: contano per tre quarti le quote del mercato (ADR 0073) e la quota minima scelta (ADR 0072).
- Il comando `ratings` resta per ripetere la prova quando la stagione 2025-26 avrà più partite.
