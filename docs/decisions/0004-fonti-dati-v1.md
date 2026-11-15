# ADR 0004 — Fonti dati v1

**Stato:** Accettata (approvata il 2026-11-07) · **Data:** 2026-11-07

## Contesto

Nessuna fonte gratuita copre la stagione corrente con formazioni, statistiche e quote. Dettagli in `docs/architecture/M0-piano-tecnico.md` §2.

## Decisione

| Ruolo                                                  | Fonte                           | Limite                                                                                |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------- |
| Calendario, risultati, classifiche (stagione corrente) | football-data.org Free          | 12 competizioni, 10 req/min, punteggi in ritardo                                      |
| Storico per training (formazioni, statistiche)         | API-Football Free               | 100 req/giorno, solo stagioni 2022–2024                                               |
| Quote 1X2                                              | The Odds API Starter            | 500 crediti/mese, bookmaker IT: Codere, Unibet                                        |
| Secondarie                                             | StatsBomb Open Data, OpenLigaDB | stagioni sparse, attribuzione obbligatoria (StatsBomb), ODbL (OpenLigaDB)             |
| **Esclusa**                                            | football-data.co.uk             | i termini vietano l'uso per "data training products using automated bots/scrapers/AI" |

I termini d'uso di football-data.org e API-Football vanno letti e registrati in `docs/data-sources/` prima dell'integrazione (M2).

## Conseguenze

- Ogni adapter dichiara copertura, licenza e health.
- L'inclusione di football-data.co.uk richiede un consenso scritto del gestore e una nuova ADR.
