# API-Football (API-SPORTS)

**Verificato il:** 11/11/2026 · **Codice provider:** `api-football` · **Usato in:** M2 corsia A, fase A3 (backfill storico) · **Decisioni:** [ADR 0004](../decisions/0004-fonti-dati-v1.md), [ADR 0010](../decisions/0010-modello-dati-calcio.md) · **Migrazione:** `20261111150000_api_football_termini.sql`

Termini regolati dalla legge francese. Il sito blocca la lettura automatica (verifica anti-bot): termini e documentazione li ha letti a mano `gennpalm` e li ha forniti in sessione l'11/11/2026.

## Termini d'uso

Fonte: https://www.api-football.com/terms, versione "Last updated: May 21, 2025".

| Clausola                 | Contenuto                                                                                                                                                                                                     | Cosa comporta per PREDICTRA                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                  | "Accounts are individual and may not be shared with other developers. It is forbidden to have multiple accounts to increase the limit of the free plan."                                                      | **Un solo account**, quello di `gennpalm`. La chiave sta solo nel segreto GitHub `API_FOOTBALL_KEY`. Il primo account (7/11) risulta sospeso: va chiuso tramite il supporto, non riusato                      |
| Rivendita                | "it is prohibited to resell this data to third parties […] We provide data for you to create different projects such as applications, websites, fantasy soccer games etc."                                    | Consentito: conservare i dati nel nostro database e usarli nei modelli. Vietato vendere o ridistribuire i dati grezzi                                                                                         |
| Licenza di pubblicazione | "We do not provide a "license" for the use and publication of the data […] Any license or permission to publish the data must be requested by the user from the competent authorities."                       | Nessuna licenza sui diritti di leghe e federazioni. PREDICTRA è privata, su invito, senza uso commerciale (anche per il piano Vercel Hobby): i dati restano interni. Una pubblicazione richiede una nuova ADR |
| Piattaforme di scommessa | "The use of our data for betting platforms, television broadcasting, fantasy sports platforms, or any mass media distribution may require additional licenses from the relevant rights holders."              | PREDICTRA non piazza scommesse e non è un bookmaker (regola 10): rientra nell'uso privato di analisi. Da rivalutare prima di ogni apertura al pubblico                                                        |
| Attribuzione             | non richiesta                                                                                                                                                                                                 | `providers.attribution` vuoto                                                                                                                                                                                 |
| Loghi e immagini         | forniti "solely for identification and descriptive purposes"; i diritti restano ai titolari                                                                                                                   | Non li scarichiamo                                                                                                                                                                                            |
| Limite al minuto         | superarlo è una "material breach": sospensione automatica o chiusura dell'account, senza preavviso                                                                                                            | Il collector resta sempre sotto il limite al minuto letto negli header `X-RateLimit-*`, con un margine                                                                                                        |
| Quota giornaliera        | piano da dashboard: azzeramento alle 00:00 UTC; "when your quota limit is reached, your account will be suspended for the rest of the day"                                                                    | Budget in `agent_rate_limits` sotto il limite (90 su 100 al giorno), così la quota non si raggiunge mai                                                                                                       |
| Piano Free               | "gives you access to all available APIs and endpoints, but remains limited in terms of available data. We reserve the right to modify the Free Plan and the available data at any time without prior notice." | Stagioni e coperture si verificano con l'API stessa prima del backfill, non si danno per scontate                                                                                                             |
| Qualità dei dati         | "provided "as is" and without any guarantee"                                                                                                                                                                  | Valgono i controlli di qualità di M2 (A4)                                                                                                                                                                     |

## Documentazione tecnica

Fonte: documentazione v3 (`API-FOOTBALL (3.9.3)`), pagina salvata da `gennpalm` l'11/11/2026.

- **Base URL:** `https://v3.football.api-sports.io/`, solo richieste `GET`.
- **Chiave:** header `x-apisports-key`. Non sono ammessi altri header.
- **`/status`:** account, piano e richieste del giorno (`requests.current`, `requests.limit_day`). "This call does not count against the daily quota."
- **Header di risposta:** `x-ratelimit-requests-limit` e `x-ratelimit-requests-remaining` (giorno), `X-RateLimit-Limit` e `X-RateLimit-Remaining` (minuto).
- **`/leagues`:** restituisce per ogni stagione il campo `coverage` (per esempio `lineups`, `statistics_fixtures`). "The coverage of a competition can vary from season to season and values set to True do not guarantee 100% data availability."
- **`/fixtures`:** parametri `league` e `season` (tutte le partite di una stagione in una chiamata); `ids` con "Maximum of 20 fixtures ids" restituisce in una sola chiamata "events, lineups, statistics and players". Gli ID delle partite non cambiano mai.
- **Stagioni del piano Free: 2022, 2023 e 2024**, verificato l'11/11/2026 con `api-football-probe` ([run 43045871134](https://github.com/gennpalm/predictra/actions/runs/43045871134), 6 richieste). Per la Serie A (id 135):
  - 2022: 381 partite, 2023: 380, 2024: 380;
  - 2021 e 2025 rifiutate dal provider: "Free plans do not have access to this season, try from 2022 to 2024.";
  - copertura dichiarata da `/leagues` per tutte le stagioni dal 2019 al 2026: formazioni ✅, statistiche delle partite ✅.

  La stagione in corso (2026) resta su football-data.org. Gli ID delle altre competizioni della v1 si leggono da `/leagues` nella PR del backfill.

## Piano del backfill (fase A3)

- **Risultati:** 1 chiamata `/leagues` per competizione e 1 `/fixtures` per stagione, cioè 32 richieste in tutto (fatto, comando `api-football-backfill`).
- **Formazioni e statistiche** ([ADR 0012](../decisions/0012-statistiche-e-formazioni.md)): 1 chiamata per l'elenco della stagione e circa 19 da 20 partite, cioè circa 480 richieste e 6 giorni a 90 al giorno. Job giornaliero dell'agente `api-football.details`, con ripresa dal blocco successivo (`ingestion_runs`, `af.details`).

## Backfill

Comando `api-football-backfill` ([runbook](../operations/data-collector.md)). Il dry run dell'11/11/2026 (32 richieste) ha trovato tutte le 8 competizioni con `/leagues` (nome e paese) e 24 stagioni, per un totale di circa 7.900 partite. Le squadre si abbinano a quelle di football-data.org secondo l'[ADR 0011](../decisions/0011-abbinamento-tra-provider.md).

## Account e chiave

- Account attivo: registrato da `gennpalm` l'11/11/2026, piano Free, limite di 100 richieste al giorno (letto in dashboard).
- Segreto GitHub `API_FOOTBALL_KEY`: presente dall'11/11/2026.
- Primo account (7/11/2026): sospeso, 0 richieste usate. Da far chiudere al supporto per rispettare la regola di un solo account.
