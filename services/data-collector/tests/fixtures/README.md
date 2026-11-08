# Fixture

Esempi di risposta **ufficiali** della documentazione di football-data.org API v4, scaricati il 7/11/2026. Non sono costruiti a mano: sono il testo pubblicato dal provider.

| File                        | Fonte                                                                                                                        | Modifiche                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fd_match_330299.json`      | https://docs.football-data.org/general/v4/match.html, esempio di `GET /v4/matches/330299` (Ligue 1, 27/2/2022)               | nessuna                                                                                                                                               |
| `fd_standings_pd_2021.json` | https://docs.football-data.org/general/v4/competition.html, esempio di `GET /v4/competitions/PD/standings` (La Liga 2021/22) | tolte le righe segnaposto `[ ... way more standings ... ]`, inserite dalla documentazione per accorciare le tabelle, così che il file sia JSON valido |

L'esempio dell'elenco partite (`GET /v4/competitions/{code}/matches`) nella documentazione ha l'array `matches` abbreviato con `[ ... ]`. Per questo i test costruiscono l'involucro dell'elenco attorno alla partita ufficiale.

Quando sarà disponibile la chiave API, aggiungere risposte reali registrate (data di registrazione nel nome del file), senza mai salvare intestazioni o la chiave.
