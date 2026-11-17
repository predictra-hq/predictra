# ADR 0056 — Taratura automatica del modello sui risultati reali

- **Stato:** accettato (17/11/2026, richiesta del proprietario)
- **Milestone:** M8 (corsia A, motore delle previsioni)

## Contesto

Il proprietario chiede che il modello usi tutte le partite disponibili, confronti le sue previsioni con i risultati usciti e migliori sempre di più.

Situazione al 17/11/2026, da una prova in sola lettura su PROD:

- il modello si addestra già su **tutte le 8.716 partite concluse** presenti nel database (stagioni 2022–2026 di tutti i campionati), pesando di più le recenti (ξ);
- il backtest walk-forward rigioca 8.616 partite settimana per settimana, ogni volta solo con le partite precedenti, e le confronta con i risultati veri: Log Loss 1X2 0,9817 contro 1,0721 della baseline;
- il confronto si ripete ogni settimana (ADR 0023) e il modello attivo è sempre il più forte.

Le **impostazioni** del modello (ξ, prudenza L2, peso dell'Elo) invece erano fissate a mano con il comando `tune` (ADR 0038, 0039). Con i dati che crescono e il calcio che cambia nel corso della stagione, i valori migliori possono spostarsi.

## Decisione

1. **Ogni settimana**, quando il motore rifà i backtest (o quando cambia il codice), prova **sei varianti** vicine alle impostazioni attuali: ξ a metà e al doppio, L2 a ¾ e a 4/3, peso dell'Elo ±0,1, entro limiti fissi (`autotune.py`).
2. Ogni variante prevede le **partite degli ultimi sei mesi** (circa 1.500) come se fossero da giocare, con le sole partite precedenti, e si confronta con i risultati reali.
3. Una variante si adotta solo se:
   - sulle partite recenti ha un Log Loss più basso di almeno **0,001** (lo stesso margine del cambio di modello, ADR 0023);
   - sull'intero storico non è peggiore delle impostazioni attuali.
4. Le impostazioni adottate diventano una **versione nuova** con il suo backtest e i numeri della taratura nei parametri (`parameters.autotune`); l'attivazione compare in _Audit_ come `model.auto_activated` con il motivo «taratura automatica: …». La versione precedente si ritira e resta nello storico.
5. **Memoria:** il giro successivo legge le impostazioni dalla versione attiva e la ricerca riparte da lì. Se cambia il codice dei modelli si riparte dai valori predefiniti, che la taratura ricorregge alla prima settimana.

## Perché così

- Piccoli passi, uno per settimana, misurati su risultati veri e non visti: il modello migliora senza inseguire il caso di una giornata.
- La doppia condizione evita di adottare impostazioni buone solo per gli ultimi mesi.
- Tutto resta riproducibile e versionato (ADR 0020): ogni previsione ha versione e `as_of`.
- Le probabilità restano solo da modelli quantitativi.

## Costi

Circa 3–5 minuti di GitHub Actions in più, una volta a settimana, dentro il ciclo dell'agente (lease di 15 minuti). Nessun servizio nuovo.

## Alternative scartate

- **Griglia completa ogni settimana:** decine di backtest, troppi minuti.
- **Correzioni dirette sugli errori recenti** (pareggi, trasferte): già provate il 14/11/2026, peggiorano le giornate mai viste (`docs/operations/prediction-engine.md`).
