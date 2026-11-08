# ADR 0035 — Pianificazione dell'agente: QStash, GitHub Actions, budget e polling adattivo

**Stato:** Proposta · **Data:** 2026-11-08 · **Milestone:** M7 corsia 0

## Contesto

L'agente non ha un processo sempre attivo (ADR 0002): lavora a cicli, e la coda su Postgres è già decisa (ADR 0003, implementata in `20261108130000_agent.sql`). Restano da decidere:

- chi avvia i cicli;
- quali job girano dove;
- quanto budget gratuito si può consumare;
- come la cadenza si adatta al calendario delle partite.

### Limiti gratuiti: verifica non riuscita (punto aperto)

L'8/11/2026 ho provato a riverificare i limiti sulle pagine ufficiali. Dall'ambiente cloud di Claude Code la rete non le raggiunge: il proxy rifiuta la connessione a `upstash.com` e `docs.github.com`. I limiti **non sono quindi riverificati**. Qui sotto riporto i valori del piano M0, verificati il 7/11/2026, e li uso solo come tetto provvisorio:

| Servizio       | Valore in M0 (7/11/2026, **da riverificare**)                                                                                     | Fonte da consultare                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstash QStash | 1.000 messaggi al giorno, 10 schedule, risposta HTTP fino a 15 min. Ogni retry consuma un messaggio                               | https://upstash.com/pricing/qstash, https://upstash.com/docs/qstash/overall/pricing                                                                                                                                                                                      |
| GitHub Actions | circa 2.000 minuti Linux al mese nei repo privati. Cron con intervallo minimo di 5 minuti, con ritardi o salti nelle ore di punta | https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions, https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule |

Prima di accettare questo ADR, `gennpalm` (o una sessione con accesso a quei siti) deve:

1. aprire le pagine;
2. aggiornare la tabella con la data della verifica;
3. correggere i budget qui sotto se i limiti sono cambiati.

I budget sono **frazioni** del limite: se il limite cambia, cambiano in proporzione.

## Decisione

### 1. Due avviatori, una coda

| Avviatore                            | Cadenza                                               | Esegue                                                                                                                                                                                                                                                                                                                            | Perché                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QStash** → `/api/jobs/*` su Vercel | adattiva, da 10 a 120 minuti (§3)                     | job **leggeri** in TypeScript, pochi secondi ciascuno:<br>• `agent.tick`: ripresa dei lease scaduti (`recover_expired_agent_jobs`), heartbeat;<br>• `agent.plan`: accoda i job Python delle finestre successive, con chiavi idempotenti;<br>• `agent.watchdog`: controllo di freschezza e stato degradato, notifiche in dashboard | costa un messaggio per chiamata e nessun minuto di Actions. Le API dei provider (football-data.org, The Odds API) restano chiamate solo dai worker Python esistenti |
| **GitHub Actions** (Python)          | fissa: un ciclo ogni 3 ore, più gli orari delle quote | job **pesanti** già scritti in M2–M5:<br>• raccolta football-data.org;<br>• quote The Odds API;<br>• previsioni M4;<br>• proposte M5.<br>Il ciclo preleva dalla coda i job pronti dei tipi Python                                                                                                                                 | servono Python e le dipendenze dei servizi; la durata supera un'invocazione di Vercel                                                                               |

- **Firma:** ogni endpoint `/api/jobs/*` verifica la firma di QStash (`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) prima di fare qualsiasi cosa. Senza firma valida risponde 401 e non scrive nulla.
- **Retry:** QStash non ritenta (retry a 0 nella pubblicazione). Il retry è della coda (backoff e dead-letter, ADR 0003), così un errore non consuma messaggi in più.
- **Cicli:** ogni ciclo apre e chiude un `agent_run`, con `source` uguale a `qstash` o `github_actions`. Questi record sono l'unica fonte di "ultimo ciclo riuscito" e "frequenza reale" (`v_agent_status`).
- **Collegamento dei job:** i job di M2–M5 passano alla coda nella corsia A, fase A5, uno per PR. Fino ad allora i workflow attuali (`data-collector.yml`, `prediction-engine.yml`, `bet-builder.yml`) restano come sono.

### 2. Budget e conteggio per job

Ogni consumo si registra con `consume_agent_quota(provider, finestra, quota, costo)`, che rifiuta la richiesta se il budget sarebbe superato (`agent_rate_limits`).

**QStash** (`provider = 'qstash'`, finestra `day`, UTC): **600 messaggi al giorno**, cioè il 60% del limite M0. Il resto è margine per prove manuali e imprevisti.

| Job / messaggio                                                           | Messaggi al giorno, caso peggiore |
| ------------------------------------------------------------------------- | --------------------------------- |
| catena adattiva (`agent.tick` con `plan` e `watchdog` nello stesso ciclo) | 144 (tutto il giorno a 10 minuti) |
| schedule di sicurezza ogni ora (riavvia la catena se si interrompe)       | 24                                |
| ripresa manuale e prove                                                   | ≤ 30                              |
| **Totale**                                                                | **≤ 200**, un terzo del budget    |

**GitHub Actions** (`provider = 'github-actions'`, finestra `month`): **900 minuti al mese per l'agente**, il 45% del limite M0. Il resto resta a CI, deploy e backup (M0 §5: circa 660 minuti). A fine ciclo il worker consuma i minuti fatturati, cioè la durata di ogni job arrotondata al minuto per eccesso. Se il budget del mese non basta per un altro ciclo:

- il ciclo si salta;
- si registra un `agent_run` con stato `failed` e il motivo;
- il watchdog notifica i monitor.

Consumo stimato per job, con cadenze attuali e durate **da misurare** nella fase A2. Oggi non abbiamo misure: le durate in tabella sono un tetto di progetto, non un dato.

| Job                                   | Cicli al mese | Tetto per ciclo | Minuti al mese, tetto |
| ------------------------------------- | ------------- | --------------- | --------------------- |
| raccolta football-data.org (ogni 3 h) | 240           | 2               | 480                   |
| quote (2 al giorno)                   | 60            | 2               | 120                   |
| previsioni M4 (2 al giorno)           | 60            | 2               | 120                   |
| proposte M5 (2 al giorno)             | 60            | 2               | 120                   |
| **Totale**                            |               |                 | **840 ≤ 900**         |

Nella fase A5 i job dello stesso orario si raggruppano in un solo ciclo, per pagare un solo arrotondamento e una sola installazione delle dipendenze.

**Provider di dati:** i contatori esistenti restano validi (The Odds API: 500 crediti al mese, M3). Nella corsia A si spostano anch'essi su `agent_rate_limits`, con `provider` uguale al codice della tabella `providers`.

### 3. Polling adattivo

Alla fine di ogni ciclo, `agent.tick` pubblica su QStash il ciclo successivo con un ritardo che dipende dalle partite in `matches`:

| Situazione                                      | Prossimo ciclo                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| partita in corso, o calcio d'inizio entro 2 ore | 10 min                                                            |
| calcio d'inizio entro 24 ore                    | 30 min                                                            |
| nessuna partita nelle prossime 24 ore           | 120 min                                                           |
| budget QStash del giorno oltre l'80%            | 120 min                                                           |
| budget QStash esaurito                          | nessuna pubblicazione: resta solo lo schedule di sicurezza orario |

- La cadenza dei job Python resta quella del cron di GitHub Actions. L'adattamento riguarda **cosa** accoda `agent.plan`: per esempio, le quote pre-partita solo per le competizioni con partite entro 24 ore. L'attenzione vicino ai calci d'inizio la dà il ciclo leggero.
- Come soglia di "degradato", `v_agent_status` usa 3 volte la cadenza attesa:
  - QStash: attesa 15 minuti, degradato oltre 45;
  - GitHub Actions: attesa 180 minuti, degradato oltre 360.

  Cambiare queste soglie richiede una nuova migrazione.

### 4. Notifiche solo in dashboard

Le notifiche sono righe di `notifications`, private per utente, e la dashboard le mostra (M7 corsia B, fase B3). La piattaforma non invia email né push (ADR 0008). Il passaggio di un job a `dead` notifica automaticamente tutti gli utenti con `agents.monitor`.

## Conseguenze

- Il consumo è visibile in `agent_rate_limits`; la corsia B lo mostra accanto allo stato dell'agente.
- Con il cron fisso a 3 ore, un dato Python può arrivare con fino a 3 ore di ritardo (di più nelle ore di punta di GitHub). L'interfaccia lo dichiara con la frequenza reale osservata.
- Se la catena QStash si interrompe (deploy, errore), lo schedule di sicurezza la riavvia entro un'ora.
- Gli schedule QStash usati sono 1, più eventuali prove: ben sotto il limite M0 di 10.

## Punti aperti

1. **Limiti gratuiti da riverificare** (vedi sopra): bloccano l'accettazione dell'ADR, non la corsia 0.
2. **Avvio dei job Python da QStash** (`workflow_dispatch` via API GitHub) per la cadenza vicino ai calci d'inizio. Servirebbe un token GitHub con permesso `actions: write`, salvato come segreto su Vercel. Per ora è escluso: si decide dopo le misure della fase A2.
3. **Durate reali** dei job Python: da misurare in A2 per sostituire i tetti della tabella del §2.
4. **Fuso della finestra giornaliera di QStash:** il contatore usa giorni UTC. Va verificato che il limite di QStash si azzeri allo stesso orario.
