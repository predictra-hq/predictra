# ADR 0010 — Modello dati del calcio e ingestion v1

**Stato:** Accettata (PR #5, 7/11/2026) · **Data:** 2026-11-07

## Contesto

- M2 porta in PREDICTRA partite reali con provenienza e qualità tracciate ([piano M2](../roadmap/M2-football-data.md)).
- Fonti v1 (ADR 0004): football-data.org per la stagione in corso, API-Football per lo storico 2022–2024.
- Regola 4 di `CLAUDE.md`: ogni dato esterno conserva provider, ID del provider, `observed_at`, `event_time`, qualità e licenza.
- Le milestone successive dipendono da questo modello:
  - M3 abbina le quote alle partite;
  - M4 addestra i modelli sullo storico;
  - M6 collega le giocate alle partite;
  - M7 sposta i job nella coda (ADR 0003).
- I termini d'uso sono stati verificati il 7/11/2026. Dettagli in [docs/data-sources/](../data-sources/README.md).

## Decisione

### 1. Modello canonico

- **Entità canoniche** indipendenti dal provider: `competitions`, `seasons`, `teams`, `team_aliases`, `matches`, `standings`. Le classifiche sono fotografie: ogni osservazione è una riga nuova.
- **ID dei provider** solo in `provider_entity_map`, con chiave `(provider, entity_type, provider_entity_id)` e al più un ID per entità e provider. È la base dell'idempotenza: rieseguire un job aggiorna le stesse righe invece di duplicarle.
- **Provenienza su ogni riga di dato esterno:** `provider`, `observed_at` (quando PREDICTRA ha letto il dato) e `quality` (`OK`, `WARNING`, `ERROR`). In più c'è `event_time`, l'istante a cui il dato si riferisce secondo il provider:
  - per partite e classifiche è obbligatorio: si usa l'ultimo aggiornamento dichiarato dal provider e, in sua assenza, il calcio d'inizio o l'istante della fotografia;
  - per le anagrafiche è facoltativo.
- **Licenza:** si ricava dal provider, nella tabella `providers` (riassunto, attribuzione, data di verifica dei termini, scheda in `docs/data-sources/`).
- **Stati partita canonici:** `SCHEDULED`, `LIVE`, `FINISHED`, `POSTPONED`, `SUSPENDED`, `CANCELLED`, `ABANDONED`, `AWARDED`. Corrispondenza con football-data.org v4:

  | football-data.org                                     | Canonico    |
  | ----------------------------------------------------- | ----------- |
  | `SCHEDULED`, `TIMED`                                  | `SCHEDULED` |
  | `IN_PLAY`, `PAUSED`, `EXTRA_TIME`, `PENALTY_SHOOTOUT` | `LIVE`      |
  | `FINISHED`                                            | `FINISHED`  |
  | `POSTPONED`, `SUSPENDED`, `CANCELLED`, `AWARDED`      | uguale      |

  La corrispondenza per API-Football si definisce quando i suoi termini e la documentazione saranno verificati.

- **Viste** (punto di contatto tra le corsie A e B e con le milestone successive), tutte con `security_invoker`:
  - `v_match_center`;
  - `v_match_results`: solo partite concluse con risultato e qualità diversa da `ERROR`. Chi addestra filtra per `kickoff_at` per evitare il leakage;
  - `v_latest_standings`;
  - `v_source_health`.
- **Accesso:**
  - lettura per gli utenti autenticati con account attivo;
  - scrittura solo con la chiave secret, cioè i job di ingestion;
  - nessuna policy di scrittura per gli utenti, nemmeno per gli amministratori.

### 2. Runtime dell'ingestion

- Servizio **Python** in `services/data-collector/`, eseguito da un **workflow schedulato di GitHub Actions** ogni 3 ore, più l'avvio manuale.
  - Un solo runtime per i due adapter.
  - Il backfill di API-Football non sta nei 300 s di Vercel.
  - Le chiavi restano nei segreti GitHub.
  - Stima: circa 8 × 3 min × 30 ≈ 720 min/mese, già prevista nel budget del piano M0 §5.
- Scrive solo tramite le funzioni `start_ingestion_run`, `ingest_football_batch`, `report_quality_issues` e `finish_ingestion_run` (una transazione per lotto, vedi data dictionary), chiamate via PostgREST con la chiave secret, che va aggiunta come segreto GitHub (nome proposto: `DEV_SUPABASE_SECRET_KEY`, già presente per il bootstrap).
- QStash e la coda `agent_jobs` arrivano in M7. Nel frattempo:
  - ogni esecuzione è registrata in `ingestion_runs` con una `window_key` (tipo + entità + finestra temporale, ADR 0003);
  - un indice unico impedisce due esecuzioni `RUNNING` dello stesso lavoro;
  - un'esecuzione interrotta resta `RUNNING`: il collector, all'avvio, chiude come `FAILED` quelle più vecchie di 1 ora;
  - i backfill riprendono da `resume_cursor`.
- **Il collector non usa un provider con `terms_verified_at` vuoto** in `providers`.

### 3. Competizioni della v1

Le 8 competizioni del piano Free di football-data.org che coincidono con le leghe principali coperte da The Odds API (M0 §2.2):

| Codice football-data.org | Competizione          |
| ------------------------ | --------------------- |
| `SA`                     | Serie A               |
| `PL`                     | Premier League        |
| `PD`                     | La Liga               |
| `BL1`                    | Bundesliga            |
| `FL1`                    | Ligue 1               |
| `DED`                    | Eredivisie            |
| `PPL`                    | Primeira Liga         |
| `CL`                     | UEFA Champions League |

Sono gratuite ma escluse per ora: `ELC` (Championship), `BSA` (Brasileirão), `WC`, `EC`. Si aggiungono modificando la configurazione del collector e questo ADR.

Budget di richieste: per ciclo servono una richiesta di partite e una di classifica per competizione, circa 16 in tutto. Con il limite di 10 al minuto il collector lascia almeno 6 s tra una richiesta e l'altra.

### 4. Freschezza

Le soglie sono nella tabella `source_freshness_rules`. Oltre la soglia il dato è `STALE`.

| Provider          | Competizioni | Squadre   | Partite   | Classifiche |
| ----------------- | ------------ | --------- | --------- | ----------- |
| football-data.org | 30 giorni    | 30 giorni | 6 ore     | 24 ore      |
| API-Football      | non scade    | non scade | non scade | non scade   |

- 6 ore = due cicli mancati. Lo schedule di GitHub Actions non è garantito.
- Una partita conclusa da più di 72 ore non scade più: il risultato è stabile.
- API-Football fornisce solo storico chiuso (2022–2024), quindi i suoi dati non scadono.

### 5. Esito della verifica dei termini d'uso

- **football-data.org:** verificato. Vincoli che il codice deve rispettare:
  - attribuzione visibile "Football data provided by the Football-Data.org API" (la mostra il Data Center);
  - la chiave vale per una sola applicazione e non va mai messa in un repository;
  - niente loghi di squadre e competizioni (protetti da copyright);
  - nessun uso "eccessivo".

  I termini non trattano esplicitamente conservazione, uso commerciale e visualizzazione a più utenti. Per una piattaforma privata con pochi utenti invitati, senza ricavi, l'uso è ritenuto compatibile. Se PREDICTRA diventasse commerciale va chiesto al gestore.

- **API-Football:** **NON VERIFICATO.** Il sito blocca la lettura automatica (HTTP 403 e verifica anti-bot). La fase A3 (backfill) è **bloccata** finché il proprietario non legge i termini a mano e li registra in [api-football.md](../data-sources/api-football.md). Poi una migrazione nuova imposta `terms_verified_at`.

## Conseguenze

- Le corsie A e B lavorano solo sulle tabelle e viste di questo contratto. I cambi passano da una PR di contratto dedicata.
- Senza API-Football lo storico per M4 parte dai soli risultati di football-data.org: la stagione in corso e quelle disponibili nel piano Free. Il backfill 2022–2024 si aggiunge quando i termini sono verificati.
- Niente live: i punteggi del piano Free sono in ritardo (coerente con ADR 0005).
- I nomi delle squadre sono quelli del provider. L'abbinamento con altre fonti (M3) passa da `team_aliases`.
