# Smart Bet Builder — runbook (M5 corsia A)

Servizio Python in `services/bet-builder/`. Decisioni: [ADR 0025](../decisions/0025-regole-combinazioni.md), [ADR 0026](../decisions/0026-correlazioni.md), [ADR 0027](../decisions/0027-motore-ranking-categorie.md). Dati: [bet-builder.md](../data-dictionary/bet-builder.md).

## Come funziona

```text
GitHub Actions "Bet Builder" (07:53 e 17:07 UTC, dopo le raccolte delle quote; più l'avvio manuale)
  1. modello attivo (model_versions.status = ACTIVE); se non c'è, nessuna run
  2. v_match_center: partite SCHEDULED dei prossimi 7 giorni (calcio d'inizio tra almeno 15 minuti)
  3. predictions: l'1X2 più recente del modello attivo per partita ed esito
  4. odds_snapshots h2h: l'ultima quota per bookmaker ed esito, qualità OK e FRESH
     (letta da meno di 12 ore, con 30 minuti di margine); per ogni esito la quota più alta
  5. combinazioni (builder.py) → start_bet_builder_run → record_bet_proposals → finish_bet_builder_run
```

- **Selezioni ammesse:** probabilità ≥ 0,20, Confidence Score ≥ 0,40, EV ≥ 0,02 (ADR 0025 §3).
- **Combinazioni:** singole e multiple fino a 4 selezioni, sulla **stessa giornata** (data a Roma del calcio d'inizio), con partite e squadre tutte diverse. Per giornata si considerano le 30 selezioni con il punteggio migliore.
- **Soglie della combinazione:** probabilità ≥ 0,10, EV ≥ 0,05. Categoria dalla probabilità, ranking `C · EV / σ`, al massimo 5 proposte per giornata e categoria.
- **Nessuna schedina forzata:** se nulla supera le soglie la run si chiude `SUCCEEDED` con zero proposte, e la pagina mostra lo stato vuoto.
- Il database ricalcola tutti i valori e rifiuta l'intero lotto se una proposta non rispetta le regole: in quel caso la run si chiude `FAILED` con il messaggio d'errore.
- `joint.py` (probabilità congiunta sulla stessa partita dalla matrice di M4) è pronto e testato, ma in v1 non produce proposte: manca la quota reale della combinazione (ADR 0026 §1).

## Prerequisiti

- Gli stessi segreti del motore delle previsioni: `DEV_SUPABASE_PROJECT_ID` e `DEV_SUPABASE_SECRET_KEY`. Nessun segreto nuovo.
- Un modello attivo con previsioni recenti ([prediction-engine.md](prediction-engine.md), _Attivare un modello_). Senza modello attivo il job termina senza errori e senza run.
- Lo schedule e l'avvio manuale compaiono in _Actions_ solo quando `.github/workflows/bet-builder.yml` è anche su `main`.

## Avvio manuale

_Actions → Bet Builder → Run workflow_, branch `dev`.

- `dry_run`: calcola le proposte senza scrivere nulla e le stampa nel log.
- `horizon_days`: quanti giorni di partite considerare (predefinito 7, massimo 14).

## Verifiche

- Ultima run: `select * from v_bet_builder_latest_run;` (stato, combinazioni valutate, proposte scritte).
- Proposte attive: `select * from v_active_bet_proposals order by slate_date, category, rank;`.
- Selezioni con quota attuale: `select * from v_bet_proposal_legs where proposal_id = <id>;`.

## Costi

Circa 1 minuto di GitHub Actions per run, 2 run al giorno: circa 60 minuti al mese.
