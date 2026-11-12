# ADR 0034 — Risultato al 90' e problemi di qualità che si chiudono da soli

**Stato:** Accettata (problemi di qualità segnalati dal proprietario il 12/11/2026) · **Data:** 2026-11-12 · **Aggiorna:** ADR 0010, ADR 0011

## Contesto

- La pagina Data Center mostrava 46 avvisi `match.score_non_regular`, tutti di API-Football. Erano partite di coppa e di spareggio finite ai supplementari o ai rigori.
- Verifica reale del 12/11/2026 su DEV (2 richieste):

  | Fixture       | `score.fulltime` | `score.extratime` | `goals` | rigori |
  | ------------- | ---------------- | ----------------- | ------- | ------ |
  | 1208413 (PEN) | 0-1              | 1-1               | 1-2     | 5-6    |
  | 1271721 (AET) | 1-0              | 0-1               | 1-1     | —      |

  `goals` comprende i supplementari ma non i rigori; `score.fulltime` è il risultato al 90'.

- Il collector salvava `goals`, cioè il risultato dopo 120 minuti. Le quote 1X2 e under/over si regolano invece sul 90', e il modello si allenava su quel risultato.
- Gli avvisi restavano aperti per sempre: nessun job li chiudeva quando il problema spariva. Lo stesso valeva per `match.score_unexpected` (una partita poi giocata regolarmente).

## Decisione

1. **`matches.home_score` / `away_score` = risultato al 90'** (recupero compreso). `score_duration` continua a dire se la partita è andata ai supplementari o ai rigori.
   - **API-Football:** con `AET` e `PEN` si usa `score.fulltime`. Senza quel dato il punteggio resta vuoto, con l'errore `match.score_missing`.
   - **football-data.org:** con `EXTRA_TIME` e `PENALTY_SHOOTOUT` si usa `score.regularTime` quando la risposta lo contiene. Senza, si conserva `fullTime` con l'avviso `match.score_non_regular` (partita in `WARNING`).
2. **Chiusura automatica:**
   - nuova RPC `resolve_quality_issues(run, controlli, id)`, solo `service_role`;
   - dopo ogni lotto il collector chiude i problemi aperti `match.score_missing`, `match.score_non_regular` e `match.score_unexpected` delle partite che non li hanno più;
   - si chiudono solo i problemi del provider dell'esecuzione.
3. **Correzione dello storico, automatica:**
   - il job giornaliero dell'agente `api-football.details`, prima di statistiche e formazioni, riscarica i risultati 2022–2024 con la normalizzazione attuale;
   - una esecuzione per stagione, con tipo `af.rescore.2`: quelle riuscite si saltano, quindi costa 32 richieste una volta sola e, se il budget non basta, riprende il giorno dopo;
   - va prima dei dettagli perché quelli usano tutto il budget del giorno. Prova del 12/11/2026: il lavoro manuale delle 14:13 UTC ha trovato solo 9 richieste rimaste e si è fermato senza usarne;
   - lo stesso lavoro si può avviare a mano con `api-football-rescore` (_Data collector_), che condivide l'avanzamento.

## Conseguenze

- Il modello si allena sul risultato al 90', come i mercati su cui si gioca.
- Dopo la correzione dello storico (al più tardi il ciclo dell'agente dopo la mezzanotte UTC) i 46 avvisi si chiudono da soli. Quello di `match:567352` si chiude alla prossima raccolta di football-data.org.
- Migrazione `20261112050000_quality_issues_resolve.sql`; test in `supabase/tests/football.test.ts` e nel collector (`test_adr_0034_*`).
