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

## Prima misura (26/11/2026)

_Verifica DEV_ → `slip-analysis` ([run](https://github.com/predictra-hq/predictra/actions/runs/45860997992)), dati di DEV (copia di PROD). Campione: 519 giocate su 94 partite con quote prima del via; per le schedine 114 giocate decise su **58 partite** (soglia 300: non raggiunta).

| Confronto (Brier, differenza da oggi; negativo = meglio) | Risultato             | Lettura                                   |
| -------------------------------------------------------- | --------------------- | ----------------------------------------- |
| Modello senza calibrazione                               | −0,00000 ± 0,00013    | la calibrazione non cambia nulla          |
| Shin con mercato al 75%                                  | +0,00010 ± 0,00047    | nessuna differenza dal proporzionale      |
| Proporzionale con mercato al 90%                         | −0,00089 ± 0,00095    | direzione giusta, dentro il rumore        |
| Solo mercato (proporzionale)                             | −0,00132 ± 0,00158    | direzione giusta, dentro il rumore        |
| Metodi del margine sull'1X2 (Log Loss, 93 partite)       | Shin +0,0004 ± 0,0071 | potenza +0,0018 ± 0,0121: nessun guadagno |

Altri segnali:

- **Taratura** della probabilità usata nelle schedine: attese 73,5 giocate vinte, uscite 64 (z = −1,95, al limite). Le giocate scelte sono un po' troppo ottimiste. È l'effetto atteso di una scelta che premia le giocate dove il modello è più ottimista del mercato.
- **Modello contro mercato** sulle giocate delle schedine: Brier +0,0101 ± 0,0099, il modello indovina peggio, al limite del rumore.
- **Ricerca esaustiva:** troppe poche schedine per confrontarla (da 0 a 5 per profilo).

**Decisione:** nessuna modifica. Shin e la calibrazione non migliorano nulla e restano solo nell'analisi. L'unica direzione costante, sia qui sia negli ADR 0071 e 0073, è dare più peso al mercato. Si rivaluta con la stessa analisi quando le partite decise superano 300 (circa 4–6 settimane): se il vantaggio del solo mercato resta e supera due errori standard, il peso sale (nuovo ADR, nuova `SLIP_RULES_VERSION`).

## Conseguenze

- La taratura automatica adotterà meno varianti: quelle adottate saranno miglioramenti veri.
- Nessuna schedina e nessuna probabilità in servizio cambia con questo ADR.
