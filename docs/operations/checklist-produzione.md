# Checklist di produzione (M8, corsia 0 e fase B3)

**Stato:** bozza del 14/11/2026, da approvare da `gennpalm`.

I criteri ufficiali di chiusura di M8 sono i paragrafi **§23.3 e §26 del Prompt Master**, che non sono nel repository ([piano M8](../roadmap/M8-hardening-e-produzione.md), prerequisito P1). Questa checklist raccoglie ciò che il repository già richiede (piano M0 §6, piano M8, `security.md`, ADR): quando il proprietario aggiunge i due paragrafi, le voci mancanti vanno integrate qui.

Legenda: `[x]` fatto e verificabile nel repository o su DEV · `[ ]` da fare.

## 1. Sicurezza

- [x] Accesso solo su invito, ruoli e gerarchia nel database, RLS su tutte le tabelle con test in CI ([security.md](security.md)).
- [x] 2FA obbligatoria per l'area amministrativa; le RPC amministrative richiedono `aal2`.
- [x] CSP con nonce, intestazioni di sicurezza, nessuna indicizzazione.
- [x] Audit append-only con filtri e paginazione.
- [x] Revisione di sicurezza dell'8/11/2026: database, segreti, dipendenze, workflow.
- [x] Dati personali (bankroll, giocate) non leggibili dagli amministratori, verificato su DEV con _Verifica DEV_.
- [ ] **Step-up 2FA** per le azioni distruttive: in servizio ([ADR 0077](../decisions/0077-step-up-2fa.md)); da provare su DEV con un login reale (ADR 0077, «Verifica»).
- [ ] Protezione da password compromesse: non disponibile sul piano Free di Supabase. Accettare il limite per iscritto oppure approvare il piano Pro.
- [ ] `pnpm audit`: vulnerabilità moderata di `minimatch` negli strumenti di lint, da chiudere quando esce la versione corretta di `typescript-eslint`.
- [ ] Protezione dei branch: con il repository pubblico è disponibile sul piano Free. Regole per `dev` e `main` da creare ([ADR 0075](../decisions/0075-segreti-e-dati-con-repository-pubblico.md), passo 7).
- [x] Repository pubblico: niente link d'invito, backup né screenshot negli artifact o nei log dei workflow ([ADR 0075](../decisions/0075-segreti-e-dati-con-repository-pubblico.md)).
- [ ] Run con dati esposti cancellati, segreti spostati negli Environments `operazioni`, `dev` e `prod`, impostazioni di sicurezza del repository attivate ([ADR 0075](../decisions/0075-segreti-e-dati-con-repository-pubblico.md), passi 1–8).

## 2. Backup e ripristino

- [x] Backup cifrato giornaliero su storage separato e test di ripristino mensile ([backup-restore.md](backup-restore.md), [ADR 0040](../decisions/0040-backup.md)).
- [x] Primo backup e primo ripristino riusciti l'8/11/2026.
- [ ] Il proprietario conferma di avere una copia della passphrase dei backup **fuori da GitHub**.
- [x] Backup attivo anche su PROD (primo backup `predictra-prod-20261117T110015Z` su B2) e primo test di ripristino del backup di PROD riuscito il 17/11/2026 (18 tabelle su 18, 49 policy RLS), con Supabase CLI 3.2.0: con la 3.0.0 il ripristino si fermava su `pg_attver`, perché PROD ha un Postgres più recente. Il test mensile programmato usa la 3.2.0 dal prossimo merge in `main`.

## 3. Dati e modelli

- [x] Ogni dato esterno conserva provider, identificativo, `observed_at`, `event_time`, qualità e licenza; nessun dato inventato.
- [x] Termini d'uso dei provider verificati e attribuzioni mostrate ([docs/data-sources/](../data-sources/README.md)).
- [x] Previsioni versionate e riproducibili; modello attivo solo se batte la baseline nel backtest.
- [x] Bet Builder: nessuna schedina forzata, solo quote `FRESH`, proposte immutabili.
- [ ] Chiusura del primo account API-Football (sospeso) tramite il supporto: i termini vietano più account ([punto-della-situazione.md](punto-della-situazione.md)).
- [ ] Conservazione dei dati decisa: [ADR 0041](../decisions/0041-retention.md) (proposta).

## 4. Agente e limiti gratuiti

- [x] Coda con retry, dead-letter, heartbeat, watchdog e avvio di riserva; frequenza reale dichiarata nell'interfaccia.
- [x] Budget misurati: minuti di GitHub Actions e messaggi QStash entro i limiti gratuiti ([ADR 0035](../decisions/0035-pianificazione-agente.md)).
- [x] Budget con **due ambienti**: solo PROD raccoglie dati e fa girare agente, motore e schedine; DEV riceve una copia al giorno ([ADR 0055](../decisions/0055-una-sola-raccolta-prod-copia-su-dev.md)). Verificato il 17/11/2026: il primo ciclo su PROD non ha ripetuto le raccolte già fatte da DEV.
- [ ] **Spazio del database** (500 MB sul piano Free): 91 MB il 17/11/2026, di cui 49 MB di previsioni, che crescono di circa 12.000 righe (5 MB) al giorno. Al ritmo attuale il limite arriva verso febbraio 2027. Regola di conservazione delle previsioni superate decisa il 17/11/2026 ([ADR 0041](../decisions/0041-retention.md)): attiva in PROD dal primo giro del motore dopo il merge in `main`.

## 5. Accessibilità e interfaccia

- [x] Audit di accessibilità con axe: 26 controlli su 26 superati, ripetibile con _Verifica DEV_ → `accessibility` ([accessibilita.md](accessibilita.md)).
- [x] Tutte le voci del menu principale sono pagine in servizio con dati reali.
- [x] Preferenza del fuso orario applicata a tutte le date dell'app (14/11/2026).
- [ ] Prova manuale con tastiera e screen reader delle pagine aggiunte dopo l'audit del 9/11/2026.

## 6. Procedure

- [x] Messa in servizio da zero: [checklist-messa-in-servizio.md](checklist-messa-in-servizio.md).
- [x] Runbook operativo: [runbook.md](runbook.md) (deploy, rollback, rinnovo dei token, provider non raggiungibile, minuti esauriti, ripristino).
- [x] Runbook dei singoli motori: [agent.md](agent.md), [data-collector.md](data-collector.md), [prediction-engine.md](prediction-engine.md), [bet-builder.md](bet-builder.md).
- [ ] Runbook provato almeno una volta su DEV nelle voci mai eseguite davvero: rollback da Vercel e rimozione della 2FA di un utente dalla dashboard di Supabase.

## 7. Ambiente di produzione (fase A4, `gennpalm`)

Procedura: [setup.md](setup.md) §7 e [checklist-messa-in-servizio.md](checklist-messa-in-servizio.md), con `prod` al posto di `dev`.

- [x] Progetto Supabase `predictra-prod` (regione europea, come DEV). Il piano Free ammette 2 progetti attivi: DEV e PROD li occupano entrambi.
- [x] Progetto Vercel `predictra-prod`, creato dal workflow _Prepara Vercel PROD_ senza collegamento a Git (il piano Hobby non importa i repository delle organizzazioni), senza integrazioni, con le variabili d'ambiente dei tipi indicati nella checklist di messa in servizio (B2).
- [x] Segreti GitHub `PROD_SUPABASE_PROJECT_ID`, `PROD_SUPABASE_DB_PASSWORD`, `PROD_SUPABASE_SECRET_KEY`, `PROD_APP_BASE_URL`, `PROD_VERCEL_PROJECT_ID`; token Supabase esteso al nuovo progetto.
- [x] Segreti e variabili di agente, QStash, provider, Ask PREDICTRA e backup per PROD ([ambienti.md](ambienti.md), [agent.md](agent.md)).
- [x] Merge di `dev` in `main` con CI verde: _Deploy PROD_ verde.
- [x] _Bootstrap Super Admin_ con ambiente `prod`; attivazione degli account con 2FA; run del workflow eliminati.
- [ ] Verifica finale della checklist di messa in servizio (fase E) su PROD. Parte automatica fatta il 17/11/2026: _Verifica DEV_ → `accessibility-prod`, 55 controlli su 55 sul sito in servizio. Restano le prove manuali (inviti, sospensione, reset password).
- [x] Primo ciclo dell'agente riuscito su PROD; _Data Center_ con fonti aggiornate; modello attivo; backup di PROD presente.
- [ ] `ambienti.md`, `README.md`, `CLAUDE.md` e la [roadmap](../roadmap/README.md) aggiornati con PROD in servizio.

## 8. Chiusura

- [ ] Paragrafi §23.3 e §26 del Prompt Master aggiunti al repository e confrontati con questa checklist.
- [ ] Checklist approvata dal proprietario.
