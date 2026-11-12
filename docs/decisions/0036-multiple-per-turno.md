# ADR 0036 — Multiple sull'intero turno e multiple sempre rappresentate

**Stato:** Accettata (richiesta del proprietario del 12/11/2026: "le proposte non dovrebbero unire più partite?") · **Data:** 2026-11-12 · **Aggiorna:** ADR 0026, ADR 0027

## Contesto

- Prova su DEV del 12/11/2026, in sola lettura: 13 proposte, 7 multiple, ma solo all'interno dello stesso giorno.
- Una partita di venerdì non poteva mai stare in schedina con quelle di sabato o domenica, perché la "giornata" era la data di calendario.
- Il ranking `C · EV / σ` favorisce le singole, perché la varianza cresce con il numero di selezioni. Con 5 posti per categoria le multiple potevano sparire.

## Decisione

1. **Turno al posto del giorno:** le multiple uniscono partite dello stesso turno, nel fuso Europe/Rome:
   - da **venerdì a lunedì** (fine settimana);
   - da **martedì a giovedì** (turno infrasettimanale).

   Le regole dell'ADR 0026 restano: partite e squadre tutte diverse, indipendenza dichiarata, al massimo 4 selezioni.

2. **Posti per turno e categoria:** 8 (`max_proposals_per_category`). Tra questi c'è sempre la migliore proposta di ogni numero di selezioni (singola, doppia, tripla, quadrupla) che supera le soglie. Gli altri posti vanno ai punteggi migliori, e l'ordine resta quello del ranking.
3. **Regole** `2026.11.12-2`, sia nel motore sia in `@predictra/shared-types`. Nessuna migrazione: le regole viaggiano con la run e `slate_date` resta la data della prima partita.
4. **App:** le proposte sono raggruppate per turno (per esempio "Turno venerdì 20 – lunedì 23 novembre"), e il filtro sceglie il turno.

## Conseguenze

- Più multiple, con partite di giorni diversi dello stesso fine settimana.
- Soglie invariate: se una multipla non ha valore non viene proposta, e nessuna schedina viene forzata.
- Test: `test_adr_0036_*` nel motore e "turni (ADR 0036)" nell'app.
