# Data collector — runbook (M2 e M3, corsia A)

Servizio Python in `services/data-collector/` che scarica partite e classifiche della stagione in corso da football-data.org e le scrive su Supabase DEV. Decisioni: [ADR 0010](../decisions/0010-modello-dati-calcio.md). Termini del provider: [football-data-org.md](../data-sources/football-data-org.md).

## Come funziona

Dall'8/11/2026 (M7 fase A5) la raccolta automatica ogni 3 ore passa dalla coda dell'agente: il workflow _Agent (Python)_ accoda la finestra di 3 ore corrente (`football-data.collect:<AAAA-MM-GG>T<HH>`) e la esegue con lo stesso codice di questo servizio, con retry, dead-letter e stato in _Amministrazione → Agente_ ([runbook dell'agente](agent.md)). Il workflow _Data collector_ resta per le quote e per l'avvio manuale. Il cambio vale dal merge di `dev` in `main`.

```text
GitHub Actions "Agent (Python)" (ogni 3 ore, minuto 47: job football-data.collect della coda, M7)
oppure "Data collector" (solo avvio manuale)
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
06:47 UTC  daily     → /odds per le 8 competizioni (1 credito ciascuna, 0 se non ci sono eventi)
15:47 UTC  prematch  → /events (gratuito); /odds solo per le competizioni con partite nelle 6 ore successive
(job odds.collect dell'agente; se un ciclo salta lo fa il successivo nella finestra, mai due volte al giorno)
  per ogni competizione: start_ingestion_run → ingest_odds_batch → report_quality_issues → finish_ingestion_run
```

- **Dall'8/11/2026** le raccolte automatiche delle quote passano dalla coda dell'agente (job `odds.collect`, schedule di _Agent (Python)_; [runbook](agent.md)). Finestre: `daily` 06–15 UTC, `prematch` 15–21 UTC. Un tentativo che ha già speso crediti non si ripete; senza crediti spesi si ritenta una volta sola. _Data collector_ resta per l'avvio manuale.
- **Budget:** misurati 7–8 crediti al giorno per l'1X2 (7–12/11/2026). Dal 12/11/2026 la raccolta giornaliera aggiunge l'under/over (`totals`) solo se i crediti residui bastano fino a fine mese con 2 mercati: circa 16 al giorno nei giorni con partite, sempre sotto i 500 al mese ([ADR 0029](../decisions/0029-quote-under-over-gratis.md)). Prima della partita resta solo 1X2.
  - Il client legge `x-requests-remaining` e si ferma sotto la riserva di 20 crediti; l'esecuzione risulta `FAILED` con il motivo.
  - Crediti usati e residui finiscono in `ingestion_runs` (`requests_used`, `quota_remaining`) e nel Data Center.
- **Abbinamento:** ogni evento si abbina a una partita tramite gli alias delle squadre.
  - Gli eventi non abbinati diventano il problema di qualità `odds.event_unmatched`, che riporta i nomi ricevuti.
  - Un Super Admin con 2FA aggiunge l'alias mancante con la funzione `add_team_alias(team_id, alias)`. Il problema si chiude da solo alla raccolta successiva.
- **Avvio manuale:** _Actions → Data collector → Run workflow_.
  - Scegli il branch `dev`, poi `job` = `odds-daily` o `odds-prematch`.
  - Con `dry_run` attivo il log mostra eventi, bookmaker ed eventuali esiti che non sono né una squadra né `Draw`. Consuma comunque i crediti della chiamata.

## API-Football: verifica del piano (M2 fase A3)

Prima del backfill storico serve sapere quali stagioni dà davvero il piano Free: la documentazione non lo dice ([scheda](../data-sources/api-football.md)).

1. _Actions → Data collector → Run workflow_, branch `dev`, `job` = `api-football-probe`.
2. Il run non scrive nulla e usa al massimo 6 richieste delle 100 giornaliere. `/status` è gratuito.
3. Nel log:
   - piano, stato e richieste del giorno;
   - le ultime stagioni della Serie A con la copertura dichiarata (formazioni, statistiche);
   - per ogni anno dal 2021 al 2025, il numero di partite restituite oppure `NON accessibile` con il messaggio del provider.

Il nome e l'email dell'account non vengono mai stampati.

## API-Football: backfill dello storico (M2 fase A3)

Risultati delle stagioni 2022, 2023 e 2024 delle 8 competizioni della v1 (circa 7.900 partite). Formazioni e statistiche arriveranno con una PR di contratto dedicata.

1. **Prima la prova:** _Actions → Data collector → Run workflow_, branch `dev`, `job` = `api-football-backfill`, `dry_run` attivo.
   - Non scrive nulla. Legge (in sola lettura) le squadre del database.
   - Nel log, per ogni stagione: le partite, gli _abbinamenti suggeriti_ (nome API-Football → squadra già nota) e le squadre _senza abbinamento_.
   - Controlla gli abbinamenti: un abbinamento sbagliato unirebbe due squadre diverse.
2. **Poi la scrittura:** stesso lavoro con `dry_run` spento.
3. **Costo:** 1 richiesta `/leagues` per competizione e 1 `/fixtures` per stagione, cioè 32 richieste. Il budget è di 90 al giorno, contando anche quelle già usate oggi: se non basta, il comando si ferma e il giorno dopo riprende dalle stagioni mancanti. Le stagioni già riuscite (`ingestion_runs`, `job_type = af.backfill`) non costano più nulla.
4. **Squadre non abbinate:** di solito sono nuove (retrocesse prima della stagione in corso) e non si segnalano. Compaiono nel Data Center come `team.cross_provider_unmatched` solo se la stessa stagione ha già dati di football-data.org: in quel caso probabilmente hanno un nome troppo diverso e si correggono con un alias nella pagina _Alias squadre_.
5. **Fermata al limite giornaliero:** il comando si ferma prima di aprire una nuova esecuzione, quindi nel Data Center non compare nessuna esecuzione fallita. Il log riporta `fermato: …`.

Serve la migrazione `20261111170000_football_team_hint.sql` su DEV: senza, il database ignora i suggerimenti e crea squadre doppie. Va eseguito solo dopo il merge della PR e il deploy.

## API-Football: statistiche e formazioni (M2 fase A3, ADR 0012)

Statistiche di squadra (tiri, corner, possesso, cartellini, passaggi…) e formazioni (modulo, allenatore, titolari e panchina) delle stagioni dello storico già scritte.

- **In automatico:** l'agente accoda ogni giorno il job `api-football.details`, insieme alla raccolta football-data.org, quando `API_FOOTBALL_KEY` è disponibile. Ogni job usa il budget del giorno (90 richieste, contando quelle già usate) e riprende dalla partita dove si era fermato. Ogni partita costa 2 richieste (statistiche e formazioni), quindi circa 44 partite al giorno. La stagione 2024 richiede circa 2 mesi, tutte e tre circa 6. Un errore di piano ferma subito il lavoro del giorno. A lavoro finito il job costa solo `/status`, che è gratuito.
- **A mano:** _Actions → Data collector → Run workflow_, branch `dev`, `job` = `api-football-details`. Non ha un dry run: ogni partita scaricata viene scritta.
- **Avanzamento:** in `ingestion_runs`, `job_type = af.details`, una esecuzione per competizione e stagione (`PARTIAL` con `resume_cursor = {"next": n}` finché manca qualcosa, `SUCCEEDED` alla fine).

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
