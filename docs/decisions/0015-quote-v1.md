# ADR 0015 — Quote v1: The Odds API, 1X2, regione eu

**Stato:** Proposta (diventa Accettata con il merge della PR di M3 corsia 0) · **Data:** 2026-11-07

## Contesto

- M3 raccoglie quote reali e ne calcola margine e probabilità implicite ([piano M3](../roadmap/M3-statistiche-e-quote.md)).
- Fonte prevista dall'ADR 0004: The Odds API, piano Starter gratuito. Scheda con termini e limiti verificati il 7/11/2026: [the-odds-api.md](../data-sources/the-odds-api.md).
- Il piano Starter dà 500 crediti al mese. Una chiamata alle quote costa mercati × regioni; le chiamate che non restituiscono eventi non costano nulla. `/sports` ed `/events` sono gratuiti.
- Le partite canoniche esistono già (M2, ADR 0010). Le quote vanno abbinate a quelle partite.

## Decisione

### 1. Ambito

| Voce         | Scelta                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Regione      | `eu`: è l'unica che contiene bookmaker con versione italiana (`codere_it`, `unibet_it`). La regione `it` non esiste |
| Mercato      | solo `h2h` (1X2: per il calcio include il pareggio). Gli altri mercati restano "non valutabili" (ADR 0005)          |
| Formato      | `oddsFormat=decimal`, `dateFormat=iso`                                                                              |
| Competizioni | le 8 della v1 (ADR 0010), con le chiavi della tabella sotto                                                         |

| football-data.org | The Odds API                    |
| ----------------- | ------------------------------- |
| `SA`              | `soccer_italy_serie_a`          |
| `PL`              | `soccer_epl`                    |
| `PD`              | `soccer_spain_la_liga`          |
| `BL1`             | `soccer_germany_bundesliga`     |
| `FL1`             | `soccer_france_ligue_one`       |
| `DED`             | `soccer_netherlands_eredivisie` |
| `PPL`             | `soccer_portugal_primeira_liga` |
| `CL`              | `soccer_uefa_champs_league`     |

### 2. Budget dei crediti

- Ogni chiamata (1 mercato × 1 regione) costa **1 credito**.
- **Snapshot giornaliero:** 8 chiamate al giorno, circa 240 crediti al mese.
- **Aggiornamento prima delle partite:** una seconda chiamata solo per le competizioni con partite nelle 6 ore successive, verificate prima con `/events`, che è gratuito. Massimo 8 al giorno.
- **Riserva:** il job si ferma, e lo registra, quando l'header `x-requests-remaining` scende sotto 20. A fine mese l'app mostra le quote come STALE invece di sforare.
- Ogni esecuzione registra in `ingestion_runs` i crediti usati (`requests_used`) e quelli rimasti (`quota_remaining`).

### 3. Modello dati

Dettagli in [odds.md](../data-dictionary/odds.md).

- **`bookmakers`**: catalogo dei bookmaker visti nelle risposte.
  - `italian_market` è vero solo per le versioni italiane indicate dal provider (chiave che termina con `_it`).
  - Gli altri bookmaker sono un **riferimento statistico** e l'interfaccia li etichetta così.
  - L'autorizzazione ADM dei singoli bookmaker non è verificata da PREDICTRA.
- **`markets`**: catalogo dei mercati; in v1 solo `h2h`, con selezioni `HOME`, `DRAW`, `AWAY`.
- **`odds_events`**: un evento del provider, abbinato (se possibile) a una partita canonica.
- **`odds_snapshots`**: una quota per evento, bookmaker, mercato e selezione.
  - Si aggiunge una riga nuova solo quando il provider segnala un aggiornamento (`last_update` del mercato). Rileggere la stessa quota non duplica nulla.
  - Ogni riga ha provider, `observed_at`, `event_time` (= `last_update` del provider) e qualità.
- **Abbinamento evento → partita**, fatto nel database dalla funzione di scrittura. Servono tutte e tre le condizioni:
  - stessa competizione;
  - entrambe le squadre ritrovate tramite `team_aliases` (nome normalizzato);
  - calcio d'inizio entro 36 ore.

  Gli eventi non abbinati restano senza partita e diventano un problema di qualità `odds.event_unmatched`, con i nomi ricevuti. Un Super Admin aggiunge l'alias mancante con `add_team_alias`, che registra l'operazione in audit. Gli alias non si inventano: si aggiungono solo guardando i nomi reali ricevuti.

- **Freschezza:** le quote sono `STALE` dopo **12 ore** dall'ultima osservazione (`source_freshness_rules`, tipo `odds`). Con uno snapshot al giorno, molte quote risulteranno STALE: è corretto mostrarlo.

### 4. Statistiche

Le statistiche di squadra e di lega si calcolano solo dai risultati di M2 (`v_match_results`) con viste SQL: `v_team_season_stats`, `v_team_form`, `v_league_season_stats`. Nessun dato aggiuntivo da provider.

### 5. Cache Components (ADR 0006)

Restano disattivati. Le pagine leggono con la sessione dell'utente (RLS) e i volumi sono piccoli. Si rivaluta in M8, se servirà ridurre le letture.

## Conseguenze

- Con 500 crediti non ci sono aggiornamenti frequenti né quote live.
- Lo storico delle quote esiste solo dai propri snapshot: il CLV di M6 sarà approssimato (M0 §4).
- Spazio: circa 27 bookmaker × 3 selezioni × 10 eventi × 8 competizioni ≈ 6.500 righe per snapshot completo, solo per le quote cambiate. La conservazione va rivista in M8 (ADR 0041), per esempio riducendo lo storico dei bookmaker di solo riferimento.
- Gli abbinamenti dipendono dagli alias: le prime esecuzioni produrranno eventi non abbinati da risolvere a mano.
