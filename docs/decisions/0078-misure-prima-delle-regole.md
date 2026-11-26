# ADR 0078 — Taratura oltre il rumore, matrice riproducibile, alternative misurate prima di adottarle

- **Stato:** accettato (26/11/2026)
- **Milestone:** M8 (corsia A: motore di previsione e analisi delle schedine)
- **Aggiorna:** ADR 0056 (taratura automatica), ADR 0020 (riproducibilità), ADR 0076 (regola di stop)

## Contesto

La revisione del 26/11/2026 ha proposto cinque miglioramenti a costo zero del modello e delle schedine:

- margine tolto con il metodo della potenza o di Shin al posto del proporzionale;
- ricerca esaustiva delle schedine al posto di quella giocata per giocata;
- calibrazione fuori campione;
- holdout congelato;
- soglia della taratura automatica legata all'errore statistico.

L'ADR 0076 vieta però di cambiare le regole delle schedine finché le partite già decise sono meno di 300: con meno dati la differenza tra due regole è soprattutto fortuna. Cambiare oggi metodo del margine o ricerca contraddirebbe quella regola.

## Decisione

1. **Taratura automatica oltre il rumore** (`autotune.py`). Una variante si adotta solo se migliora il Log Loss di almeno `MARGIN` (0,001) **e** il miglioramento, misurato partita per partita sulle stesse partite, supera due errori standard. Su circa 1.500 partite un errore standard vale circa 0,002: prima si poteva adottare una variante migliore solo per caso. L'audit dell'attivazione salva anche la differenza e il suo errore standard. È una regola più prudente della precedente, non una regola nuova sulle schedine.
2. **Matrice dei risultati riproducibile** (ADR 0020). Nel modello PREDICTRA λ e ρ salvati sono quelli del Dixon-Coles interno, mentre la matrice salvata è la sua riportata all'1X2 combinato. La spiegazione dell'1X2 ora dice come si ricava (`matrix_from: "dixon_coles_rescaled_to_1x2"`). Un test controlla che da λ, ρ e 1X2 salvati si riottenga la matrice.
3. **Alternative misurate, non adottate:**
   - `packages/quant` ha il metodo di Shin accanto al proporzionale e alla potenza. `marketConsensus` accetta il metodo, ma in servizio resta il proporzionale;
   - `exhaustiveLegs` cerca la combinazione più probabile che arriva alla quota, ma la usa solo l'analisi;
   - l'analisi delle schedine (_Verifica DEV_ → `slip-analysis`) confronta i tre metodi del margine sull'1X2 delle partite giocate (Log Loss, Brier, differenza ± 2 errori standard) e la ricerca esaustiva con quella in servizio (schedine, probabilità media, vinte, ritorno).
4. **Rinviati:**
   - calibrazione fuori campione: richiede di salvare le previsioni walk-forward di tutto lo storico, e oggi la calibrazione usata ha già celle minime di 200 partite e un prior;
   - holdout congelato: ha senso solo con abbastanza partite della stagione 2026-27 da metterle da parte senza toccarle. Va deciso a fine girone d'andata.

## Quando adottare le alternative

Con la riga «Campione» dell'analisi sopra le 300 partite decise. Si adotta un'alternativa se, nella stessa analisi:

- per il metodo del margine, il Log Loss migliora oltre due errori standard rispetto al proporzionale;
- per la ricerca esaustiva, le schedine hanno probabilità media più alta a parità di quota minima, senza un ritorno peggiore oltre l'intervallo.

La modifica va in un ADR nuovo e cambia `SLIP_RULES_VERSION`.

## Conseguenze

- La taratura automatica adotterà meno varianti: quelle adottate saranno miglioramenti veri.
- Nessuna schedina e nessuna probabilità in servizio cambia con questo ADR.
