# Fonti dati

Una scheda per ogni provider: termini d'uso, copertura, limiti, autenticazione. Va riletta a ogni milestone, perché i provider cambiano spesso condizioni (rischio indicato nel piano M0 §6). Richiesta dall'ADR 0004.

| Provider                  | Ruolo                                                 | Termini                                  | Scheda                                       |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| football-data.org         | stagione in corso: calendario, risultati, classifiche | verificati il 7/11/2026                  | [football-data-org.md](football-data-org.md) |
| API-Football (API-SPORTS) | storico per i modelli (stagioni da verificare)        | verificati l'11/11/2026, lettura manuale | [api-football.md](api-football.md)           |
| The Odds API              | quote 1X2 (M3)                                        | verificati il 7/11/2026                  | [the-odds-api.md](the-odds-api.md)           |
| football-data.co.uk       | —                                                     | **escluso** (ADR 0004)                   | —                                            |

Quando una verifica cambia l'esito, aggiorna la scheda, il campo `terms_verified_at` della tabella `providers` (con una migrazione nuova) e, se cambia una decisione, l'ADR collegato.
