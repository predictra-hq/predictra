# Data collector — runbook (M2 e M3, corsia A)

Servizio Python in `services/data-collector/` che scarica partite e classifiche della stagione in corso da football-data.org e le scrive su Supabase DEV. Decisioni: [ADR 0010](../decisions/0010-modello-dati-calcio.md). Termini del provider: [football-data-org.md](../data-sources/football-data-org.md).

## Come funziona

```text
GitHub Actions "Data collector" (ogni 3 ore, minuto 17, più l'avvio manuale)
  └─ per ogni competizione della v1 (SA, PL, PD, BL1, FL1, DED, PPL, CL)
       1. start_ingestion_run        → apre l'esecuzione (rifiutata se i termini non sono verificati)
       2. GET /competitions/{code}/matches e /standings   (≥ 6,5 s tra le richieste: 10/minuto)
       3. normalizzazione + controlli di qualità
       4. ingest_football_batch      → una transazione: squadre, partite, classifica
       5. report_quality_issues      → problemi di qualità aperti o aggiornati
       6. finish_ingestion_run       → SUCCEEDED, PARTIAL (con errori di qualità) o FAILED
```

- Un ciclo fa 16 richieste e dura circa 2 minuti, quindi circa 8 × 2 × 30 ≈ 480 minuti di GitHub Actions al mese.
- Rieseguire non duplica nulla: le entità si ritrovano tramite `provider_entity_map`.
- La classifica diventa una nuova fotografia solo quando cambia.
- Gli esiti sono visibili in `ingestion_runs` e nella vista `v_source_health` (pannello Data Center, corsia B).

## Quote The Odds API (M3)

Decisioni: [ADR 0015](../decisions/0015-quote-v1.md). Scheda della fonte: [the-odds-api.md](../data-sources/the-odds-api.md).

```text
07:23 UTC  odds --mode daily     → /odds per le 8 competizioni (1 credito ciascuna, 0 se non ci sono eventi)
16:37 UTC  odds --mode prematch  → /events (gratuito); /odds solo per le competizioni con partite nelle 6 ore successive
  per ogni competizione: start_ingestion_run → ingest_odds_batch → report_quality_issues → finish_ingestion_run
```

- **Budget:** al massimo 16 crediti al giorno, circa 480 al mese su 500.
  - Il client legge `x-requests-remaining` e si ferma sotto la riserva di 20 crediti; l'esecuzione risulta `FAILED` con il motivo.
  - Crediti usati e residui finiscono in `ingestion_runs` (`requests_used`, `quota_remaining`) e nel Data Center.
- **Abbinamento:** ogni evento si abbina a una partita tramite gli alias delle squadre.
  - Gli eventi non abbinati diventano il problema di qualità `odds.event_unmatched`, che riporta i nomi ricevuti.
  - Un Super Admin con 2FA aggiunge l'alias mancante con la funzione `add_team_alias(team_id, alias)`. Il problema si chiude da solo alla raccolta successiva.
- **Avvio manuale:** _Actions → Data collector → Run workflow_.
  - Scegli il branch `dev`, poi `job` = `odds-daily` o `odds-prematch`.
  - Con `dry_run` attivo il log mostra eventi, bookmaker ed eventuali esiti che non sono né una squadra né `Draw`. Consuma comunque i crediti della chiamata.

## Attivazione (una volta, `gennpalm`)

1. Registrazione gratuita al piano Free dal sito https://www.football-data.org. La chiave arriva per email.
2. GitHub → _Settings → Secrets and variables → Actions_, segreti **`FOOTBALL_DATA_API_KEY`** e **`ODDS_API_KEY`** (registrazione gratuita al piano Starter su https://the-odds-api.com).
   - `DEV_SUPABASE_PROJECT_ID` e `DEV_SUPABASE_SECRET_KEY` esistono già.
   - Se manca un segreto, la raccolta viene saltata con un avviso.
3. Lo schedule parte solo quando `.github/workflows/data-collector.yml` è su **`main`**: serve il merge di `dev` in `main`. Lo stesso vale per il pulsante _Run workflow_.
   - Il codice eseguito è sempre quello di `dev` (`checkout` con `ref: dev`).
   - I dati vanno sempre su Supabase DEV.
4. Primo controllo: _Actions → Data collector → Run workflow_ con `dry_run` attivo e `competitions` = `SA`. Il log mostra quante partite e squadre sono state lette, senza scrivere nulla. Poi lancialo senza `dry_run`.

## Uso in locale (facoltativo)

Serve [uv](https://docs.astral.sh/uv/). Le variabili restano solo nella sessione del terminale:

```powershell
cd services/data-collector
uv sync
uv run pytest
$env:FOOTBALL_DATA_API_KEY = "<chiave>"
uv run python -m predictra_collector run --competitions SA --dry-run
```

Per scrivere su DEV servono anche `SUPABASE_URL` (`https://<ref>.supabase.co`) e `SUPABASE_SECRET_KEY`.

## Problemi comuni

| Sintomo                              | Causa                                                               | Cosa fare                                                                  |
| ------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Raccolta saltata: Segreti mancanti` | segreto non inserito o con nome diverso                             | aggiungere il segreto col nome esatto                                      |
| `HTTP 403` da football-data.org      | chiave errata o competizione fuori dal piano Free                   | controllare la chiave; usare solo i codici della v1                        |
| `HTTP 429`                           | superato il limite di 10 richieste al minuto                        | aspettare il ciclo successivo; non avviare esecuzioni manuali in parallelo |
| `Esecuzione già in corso`            | un'esecuzione dello stesso lavoro è ancora `RUNNING`                | dopo 1 ora viene chiusa da sola come `FAILED`                              |
| `termini d'uso non verificati`       | provider senza `terms_verified_at`                                  | vedi [docs/data-sources/](../data-sources/README.md)                       |
| esecuzione `PARTIAL`                 | la qualità ha trovato errori (es. partita conclusa senza risultato) | controllare `data_quality_issues` aperti                                   |

## Da verificare con la chiave reale

- Se `score.fullTime` includa supplementari e rigori. Fino ad allora queste partite sono segnalate `match.score_non_regular` (WARNING).
- Gli header di quota residua (oggi `quota_remaining` resta vuoto).
- Il ritardo dei punteggi nel piano Free.
- Registrare risposte reali come nuove fixture (`services/data-collector/tests/fixtures/README.md`).
