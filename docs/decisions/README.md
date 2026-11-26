# Architecture Decision Records (ADR)

Formato: contesto → decisione → conseguenze. Stato: `Accettata` | `Accettata` | `Sostituita`.
Le motivazioni dettagliate e le fonti sono in [M0-piano-tecnico.md](../architecture/M0-piano-tecnico.md).

| ADR                                                                 | Titolo                                                                                      | Stato     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| [0001](0001-monorepo-e-branching.md)                                | Monorepo unico e strategia di branch                                                        | Accettata |
| [0002](0002-hosting-free-tier.md)                                   | Hosting a costo zero: Vercel + Supabase + GitHub Actions + QStash                           | Accettata |
| [0003](0003-coda-su-postgres.md)                                    | Coda, lock e dead-letter su Postgres                                                        | Accettata |
| [0004](0004-fonti-dati-v1.md)                                       | Fonti dati per la v1 ed esclusione di football-data.co.uk                                   | Accettata |
| [0005](0005-mercati-v1.md)                                          | Mercati valutabili in v1                                                                    | Accettata |
| [0006](0006-next-senza-cache-components.md)                         | Next.js 16 senza Cache Components (per ora)                                                 | Accettata |
| [0007](0007-cartella-supabase-e-test-rls.md)                        | Cartella `supabase/` e test RLS su Postgres embedded                                        | Accettata |
| [0008](0008-niente-email-e-deploy-automatico.md)                    | Nessuna email e deploy automatico da GitHub Actions                                         | Accettata |
| [0009](0009-lavoro-in-parallelo.md)                                 | Lavoro in parallelo per corsie                                                              | Accettata |
| [0010](0010-modello-dati-calcio.md)                                 | Modello dati del calcio e ingestion v1                                                      | Accettata |
| [0011](0011-abbinamento-tra-provider.md)                            | Abbinamento delle stesse squadre, stagioni e partite tra provider                           | Proposta  |
| [0012](0012-statistiche-e-formazioni.md)                            | Statistiche e formazioni delle partite                                                      | Accettata |
| [0015](0015-quote-v1.md)                                            | Quote v1: The Odds API, 1X2, regione eu                                                     | Accettata |
| [0016](0016-de-margin.md)                                           | Margine e probabilità implicite (de-margin)                                                 | Proposta  |
| [0020](0020-versioning-previsioni.md)                               | Versioning e riproducibilità delle previsioni                                               | Accettata |
| [0021](0021-modelli-v1.md)                                          | Modelli della v1 e mercati derivati                                                         | Accettata |
| [0022](0022-confidence-score.md)                                    | Confidence Score                                                                            | Accettata |
| [0023](0023-modello-piu-forte-automatico.md)                        | Versioni stabili e modello più forte attivato in automatico                                 | Accettata |
| [0024](0024-modello-predictra-e-sfidante.md)                        | Un modello PREDICTRA e uno sfidante                                                         | Accettata |
| [0025](0025-regole-combinazioni.md)                                 | Regole delle combinazioni (Bet Builder)                                                     | Accettata |
| [0026](0026-correlazioni.md)                                        | Correlazioni tra selezioni                                                                  | Accettata |
| [0027](0027-motore-ranking-categorie.md)                            | Motore delle combinazioni, ranking e categorie                                              | Accettata |
| [0028](0028-valore-prudente-bookmaker-italiani.md)                  | Valore prudente e quote solo di bookmaker italiani                                          | Accettata |
| [0029](0029-quote-under-over-gratis.md)                             | Quote under/over gratuite                                                                   | Accettata |
| [0030](0030-bankroll-dati-e-privacy.md)                             | Bankroll: modello dati, limiti personali e privacy                                          | Proposta  |
| [0031](0031-staking.md)                                             | Stake suggerito: flat e Kelly frazionario limitato                                          | Proposta  |
| [0032](0032-pianificatore-crediti-quote.md)                         | Pianificatore dei crediti delle quote e doppia chance                                       | Accettata |
| [0033](0033-bet-builder-tutti-i-mercati.md)                         | Bet Builder su tutti i mercati con quote italiane                                           | Accettata |
| [0034](0034-risultato-al-novantesimo.md)                            | Risultato al 90' e problemi di qualità che si chiudono da soli                              | Accettata |
| [0035](0035-pianificazione-agente.md)                               | Pianificazione dell'agente: QStash, GitHub Actions, budget                                  | Accettata |
| [0036](0036-multiple-per-turno.md)                                  | Multiple sull'intero turno e multiple sempre rappresentate                                  | Accettata |
| [0037](0037-bollette-consigliate.md)                                | Schedine consigliate per profilo di rischio                                                 | Proposta  |
| [0038](0038-modello-gol-tempo-e-neopromosse.md)                     | Modello gol: peso del tempo e neopromosse più deboli                                        | Proposta  |
| [0039](0039-sfidante-dixon-coles-elo.md)                            | Sfidante Dixon-Coles combinato con l'Elo                                                    | Proposta  |
| [0040](0040-backup.md)                                              | Backup del database e test di ripristino                                                    | Accettata |
| [0041](0041-retention.md)                                           | Conservazione dei dati (retention)                                                          | Proposta  |
| [0042](0042-ask-predictra.md)                                       | Ask PREDICTRA con un LLM gratuito                                                           | Accettata |
| [0050](0050-deploy-solo-commit-del-proprietario.md)                 | Deploy solo da commit del proprietario (piano Vercel Hobby)                                 | Accettata |
| [0051](0051-bankroll-collegato-al-sito.md)                          | Bankroll collegato al sito dove si gioca                                                    | Accettata |
| [0052](0052-link-monouso-consumati-al-tocco.md)                     | Link monouso consumati solo al tocco di «Continua»                                          | Proposta  |
| [0053](0053-taratura-entrambe-segnano.md)                           | Taratura di «entrambe segnano» e dell'under/over 1,5                                        | Accettata |
| [0054](0054-notifiche-sul-telefono.md)                              | Notifiche sul telefono (Web Push)                                                           | Proposta  |
| [0055](0055-una-sola-raccolta-prod-copia-su-dev.md)                 | Una sola raccolta dati: PROD raccoglie, DEV riceve una copia                                | Accettata |
| [0056](0056-taratura-automatica-del-modello.md)                     | Taratura automatica del modello sui risultati reali                                         | Accettata |
| [0057](0057-verifica-storica-su-tutti-i-mercati.md)                 | Verifica storica del modello su tutti i mercati                                             | Accettata |
| [0058](0058-comunita-commenti-e-maggiore-eta.md)                    | Comunità: commenti alle partite, maggiore età dichiarata, stile del nome                    | Proposta  |
| [0059](0059-schermata-offline.md)                                   | Schermata «Sei offline» con un service worker minimo                                        | Proposta  |
| [0060](0060-taratura-gol-totali-dati-reali.md)                      | Taratura dei gol totali sui dati reali                                                      | Accettata |
| [0061](0061-minuti-actions-ridotti.md)                              | Meno minuti di GitHub Actions                                                               | Accettata |
| [0062](0062-sezioni-semplici-e-schedine-passate.md)                 | Sezioni a tre viste e schedine passate                                                      | Accettata |
| [0063](0063-taratura-under-3-5.md)                                  | Taratura anche della linea 3,5 dei gol                                                      | Accettata |
| [0064](0064-comunita-chat-e-profilo-pubblico.md)                    | Comunità con più chat, schedine condivise e profilo pubblico                                | Accettata |
| [0065](0065-schedine-precise-e-calcio-con-spogliatoio.md)           | Schedine più precise, meno proposte con valore, Spogliatoio sotto Calcio                    | Accettata |
| [0066](0066-versione-automatica-per-ambiente.md)                    | Versione del sito automatica per ambiente                                                   | Accettata |
| [0067](0067-preferenze-nell-account-e-schedine-compatte.md)         | Preferenze nell'account, profilo modificabile dagli admin, schedine compatte                | Accettata |
| [0068](0068-repository-pubblico.md)                                 | Repository pubblico                                                                         | Accettata |
| [0069](0069-api-football-sospensione-gestita.md)                    | API-Football: sospensione gestita e IP condivisi                                            | Accettata |
| [0070](0070-schedine-salvate-precisione-e-spogliatoio.md)           | Schedine salvate, profili di precisione, giornata o turno, Spogliatoio con esiti e reazioni | Accettata |
| [0071](0071-schedine-a-quota-obiettivo-e-spogliatoio-con-attesa.md) | Schedine a quota obiettivo, peso del mercato, Spogliatoio con attesa, notifiche eliminabili | Accettata |
| [0072](0072-schedine-a-quota-minima.md)                             | Schedine con quota totale minima 3, 5 e 10                                                  | Accettata |
| [0073](0073-peso-del-mercato-e-verifica-delle-proposte.md)          | Peso del mercato 0,75 nelle proposte con valore e verifica onesta dei risultati             | Accettata |
| [0074](0074-modello-unico-su-tutte-le-competizioni.md)              | Modello gol unico su tutte le competizioni nel modello PREDICTRA                            | Accettata |
| [0075](0075-segreti-e-dati-con-repository-pubblico.md)              | Segreti e dati con il repository pubblico                                                   | Accettata |
| [0076](0076-schedine-riproducibili-e-quote-aggiornate.md)           | Schedine con quote aggiornate, riproducibili, e analisi senza fortuna                       | Accettata |
