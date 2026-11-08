# Roadmap e corsie di lavoro

Stato delle milestone, dipendenze e piani di lavoro. Ogni milestone ha un piano con tutto ciò che serve per partire: prerequisiti, cosa serve dalle altre milestone, decisioni da prendere, corsie con i file di loro proprietà, fasi e criteri di completamento. Le regole per lavorare in parallelo sono in [collaborazione.md](../operations/collaborazione.md); i criteri di completamento vengono dal [piano tecnico M0](../architecture/M0-piano-tecnico.md) §6.

## Stato e piani

| Milestone | Titolo                 | Dipende da  | Può partire quando                                                   | Stato                                                           | Piano                                     |
| --------- | ---------------------- | ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| M0        | Audit e piano          | —           | —                                                                    | completata                                                      | [M0](../architecture/M0-piano-tecnico.md) |
| M1        | Fondazioni             | M0          | —                                                                    | completata, **in servizio su DEV** dal 7/11/2026                | [setup](../operations/setup.md)           |
| M2        | Football data          | M1          | subito                                                               | completata, **in servizio su DEV** dal 7/11/2026 (A3 rimandata) | [M2](M2-football-data.md)                 |
| M3        | Statistiche e quote    | M2          | contratto di M2 su `dev`                                             | **in corso**: corsie 0, A e B unite, manca la chiusura          | [M3](M3-statistiche-e-quote.md)           |
| M4        | Prediction engine      | M2          | contratto di M2 su `dev` (addestramento reale: storico di M2 su DEV) | **in corso**: corsia 0 unita, corsia A in revisione             | [M4](M4-prediction-engine.md)             |
| M5        | Smart Bet Builder      | M3, M4      | contratti di M3 e M4 su `dev`                                        | **in corso**: corsia 0 unita, corsie A e B in revisione         | [M5](M5-bet-builder.md)                   |
| M6        | Bankroll e tracker     | M1 (M3, M4) | subito per la base; Kelly dopo M4, CLV dopo M3                       | da iniziare                                                     | [M6](M6-bankroll-e-tracker.md)            |
| M7        | Agente autonomo        | M2–M5       | contratto della coda subito; collegamento dei job quando esistono    | da iniziare                                                     | [M7](M7-agente-autonomo.md)               |
| M8        | Hardening e produzione | tutte       | backup e restore subito; il resto alla fine                          | da iniziare                                                     | [M8](M8-hardening-e-produzione.md)        |

"Contratto" è la corsia 0 della milestone: tabelle, viste, RLS e tipi condivisi. Si unisce su `dev` per prima proprio per sbloccare chi viene dopo (collaborazione.md §6).

## Dove si può lavorare in parallelo

```text
M1 ──┬── M2 ──┬── M3 (quote) ─────┐
     │        └── M4 (modelli) ───┴── M5 (Bet Builder) ──┐
     ├── M6 (bankroll: base subito, Kelly dopo M4) ──────┤
     └── M7 (coda subito) · M8 (backup subito) ──────────┴── M7 (job reali) ── M8 (produzione)
```

- **Dentro ogni milestone**: corsia 0, poi corsie A e B in parallelo.
- **Tra milestone**:
  - mentre una persona fa M2, l'altra può fare **M6** (base), il contratto della coda di **M7** o i backup di **M8**: non dipendono da M2;
  - dopo il contratto di M2, **M3 e M4 sono indipendenti** e si possono prendere una a testa;
  - dopo i contratti di M3 e M4 si può iniziare **M5**.

## Come iniziare una milestone

1. Apri il piano della milestone e controlla **Può partire quando** e **Cosa serve dalle altre milestone**. Se un contratto necessario non è su `dev`, segui collaborazione.md §6.
2. Controlla i **Prerequisiti**: account e segreti li prepara `gennpalm`.
3. Crea le issue delle corsie (etichette `M<N>`, `corsia:0`, `corsia:A`, `corsia:B`) e scrivi il tuo nome nella tabella **Assegnazione** del piano.
4. Nella corsia 0 prendi le **decisioni** elencate e scrivile negli ADR riservati alla milestone. Tutto ciò che nei piani è indicato come "proposta" va confermato o corretto lì.
5. Riverifica limiti e termini dei provider coinvolti: il piano M0 è del 7/11/2026 e i provider cambiano spesso le condizioni.

## Nota sul Prompt Master

La specifica completa ("Prompt Master") è stata fornita dal proprietario ma **non è nel repository**: qui ci sono il suo riassunto ([M0](../architecture/M0-piano-tecnico.md)) e gli ADR. Se una milestone richiede un dettaglio non presente (per esempio i criteri §23.3 e §26 citati per M8, o le categorie del Bet Builder), chiedilo a `gennpalm` oppure aggiungi il documento in `docs/architecture/`.
