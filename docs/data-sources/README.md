# Fonti dati

Una scheda per ogni provider: termini d'uso, copertura, limiti, autenticazione. Va riletta a ogni milestone, perché i provider cambiano spesso condizioni (rischio indicato nel piano M0 §6). Richiesta dall'ADR 0004.

| Provider                  | Ruolo                                                 | Termini                                              | Scheda                                       |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| football-data.org         | stagione in corso: calendario, risultati, classifiche | verificati il 7/11/2026                              | [football-data-org.md](football-data-org.md) |
| API-Football (API-SPORTS) | storico 2022–2024 per i modelli                       | **NON VERIFICATI**: sito non leggibile in automatico | [api-football.md](api-football.md)           |
| football-data.co.uk       | —                                                     | **escluso** (ADR 0004)                               | —                                            |

Quando una verifica cambia l'esito, aggiorna la scheda, il campo `terms_verified_at` della tabella `providers` (con una migrazione nuova) e, se cambia una decisione, l'ADR collegato.
