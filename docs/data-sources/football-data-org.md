# football-data.org

**Verificato il:** 7/11/2026 · **Codice provider:** `football-data-org` · **Usato in:** M2 corsia A, fase A2 · **Decisioni:** [ADR 0004](../decisions/0004-fonti-dati-v1.md), [ADR 0010](../decisions/0010-modello-dati-calcio.md)

Gestore: Freitag Web Tec UG. Termini regolati dalla legge dei Paesi Bassi.

## Termini d'uso

Fonte: sezione _Terms & Conditions_ di https://www.football-data.org/about, con data "Last updated: June 1, 2018". L'indirizzo `/terms` risponde 404.

| Clausola | Contenuto                                                                               | Cosa comporta per PREDICTRA                                     |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2.3      | La chiave API vale per una sola applicazione                                            | Una chiave per PREDICTRA; non riusarla in altri progetti        |
| 3.3      | Il gestore monitora l'uso e può chiudere l'account per uso eccessivo                    | Restare sotto i limiti, con una pausa fra le richieste          |
| 6.1      | Le credenziali non vanno salvate in repository di progetti open source                  | La chiave sta solo nei segreti GitHub (`FOOTBALL_DATA_API_KEY`) |
| 7.1      | Attribuzione "Football data provided by the Football-Data.org API" in un punto visibile | La mostra il Data Center; il testo è in `providers.attribution` |
| 8.1      | Nessuna garanzia di disponibilità                                                       | Health check e stato STALE visibili                             |
| 9.1      | Dopo la disdetta non si può più fare riferimento ai dati                                | Se l'account viene chiuso, i dati vanno rimossi o nascosti      |
| 9.2      | Loghi e foto appartengono ai rispettivi titolari                                        | Niente loghi di squadre e competizioni                          |

**Non trattati esplicitamente:** conservazione dei dati, uso commerciale, visualizzazione a più utenti. PREDICTRA è privata, senza ricavi e con pochi utenti invitati: l'uso è ritenuto compatibile. Va riverificato se la piattaforma diventa commerciale, chiedendo conferma scritta al gestore.

La documentazione delle classifiche consiglia di salvare una fotografia a fine stagione, perché il provider può modificare i punti delle stagioni passate (https://docs.football-data.org/general/v4/competition.html). PREDICTRA conserva tutte le fotografie (`standings`).

## Piano Free

Fonte: https://www.football-data.org/pricing e https://www.football-data.org/coverage.

- Gratuito senza scadenza.
- 12 competizioni; punteggi e calendari in ritardo (la durata del ritardo non è dichiarata).
- **10 richieste al minuto** per i client registrati (https://docs.football-data.org/general/v4/policies.html).
- Competizioni (codici dalla tabella _League Codes_ di https://docs.football-data.org/general/v4/lookup_tables.html):

| Codice | Competizione                  | Nella v1 (ADR 0010) |
| ------ | ----------------------------- | ------------------- |
| `SA`   | Serie A                       | sì                  |
| `PL`   | Premier League                | sì                  |
| `PD`   | Primera División (La Liga)    | sì                  |
| `BL1`  | Bundesliga                    | sì                  |
| `FL1`  | Ligue 1                       | sì                  |
| `DED`  | Eredivisie                    | sì                  |
| `PPL`  | Primeira Liga                 | sì                  |
| `CL`   | UEFA Champions League         | sì                  |
| `ELC`  | Championship                  | no                  |
| `BSA`  | Campeonato Brasileiro Série A | no                  |
| `WC`   | FIFA World Cup                | no                  |
| `EC`   | European Championship         | no                  |

## API v4

| Voce                 | Valore                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL             | `https://api.football-data.org/v4`                                                                                                        |
| Autenticazione       | header `X-Auth-Token`                                                                                                                     |
| Competizioni         | `/competitions`, `/competitions/{code}`                                                                                                   |
| Partite              | `/competitions/{code}/matches` (es. filtro `matchday`; gli altri filtri vanno verificati sulla documentazione), `/matches/{id}`           |
| Squadre              | `/competitions/{code}/teams`                                                                                                              |
| Classifiche          | `/competitions/{code}/standings`; 404 per le competizioni di tipo `CUP` e `PLAYOFFS`                                                      |
| Stati partita        | `SCHEDULED`, `TIMED`, `IN_PLAY`, `PAUSED`, `EXTRA_TIME`, `PENALTY_SHOOTOUT`, `FINISHED`, `SUSPENDED`, `POSTPONED`, `CANCELLED`, `AWARDED` |
| Tipi di competizione | `LEAGUE`, `LEAGUE_CUP`, `CUP`, `PLAYOFFS`                                                                                                 |

La corrispondenza con gli stati canonici è nell'ADR 0010.

## Da confermare con la chiave

- Il ritardo effettivo dei punteggi nel piano Free.
- Le stagioni passate accessibili nel piano Free.
- Gli header di quota residua nelle risposte (da salvare in `ingestion_runs.quota_remaining`).
