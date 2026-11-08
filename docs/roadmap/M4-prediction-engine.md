# M4 — Prediction engine: piano e corsie

**Stato:** in corso (corsia 0) · **Dipende da:** M2 · **Può partire quando:** il contratto di M2 (corsia 0) è su `dev`; l'addestramento reale richiede lo storico caricato dalla corsia A di M2 · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Un motore di previsione in Python che produce probabilità calibrate, versionate e riproducibili per i mercati valutabili della v1 (ADR 0005), con metriche e spiegazioni visibili nell'app.

Criteri di completamento (dal [piano M0](../architecture/M0-piano-tecnico.md) §6):

- Brier score e Log Loss migliori della baseline, misurati fuori campione;
- controllo anti-leakage: nessuna informazione successiva al calcio d'inizio entra nelle feature;
- probabilità coerenti: somme a 1, complementi, handicap asiatici con push e mezze linee;
- riproducibilità: stessa versione e stessi dati producono gli stessi numeri;
- le probabilità vengono solo dai modelli, **mai** da un LLM (regola 5 di `CLAUDE.md`).

## Assegnazione

| Corsia          | Persona   | Issue | Stato                                      |
| --------------- | --------- | ----- | ------------------------------------------ |
| 0 — contratto   | Alfry1299 | —     | in revisione (PR `feature/m4-0-contratto`) |
| A — motore      | —         | —     | da iniziare                                |
| B — interfaccia | —         | —     | da iniziare                                |

## Prerequisiti

| #   | Cosa                                                                                                              | Chi      | Serve a    |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| P1  | Storico delle partite su DEV (football-data.org più backfill API-Football 2022–2024 della corsia A di M2)         | M2       | fasi A3–A5 |
| P2  | Stima dei minuti GitHub Actions per addestramento e previsioni (M0 §5: circa 720 minuti al mese per i job Python) | corsia 0 | ADR 0020   |

Nessun nuovo account né segreto: il motore scrive su Supabase con la chiave secret già presente nei segreti della pipeline (va solo aggiunta al workflow del motore).

## Cosa serve dalle altre milestone

| Da  | Cosa                                               | Se non è ancora su `dev`                                                          |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| M2  | tabelle e viste delle partite con risultati finali | aspettare o chiedere il merge della corsia 0 di M2                                |
| M2  | storico reale caricato                             | sviluppare e testare i modelli su fixture registrate; il backtest reale dopo M2 A |
| M2  | runtime Python e workflow schedulati (ADR 0010)    | riusare la stessa struttura di `services/`                                        |

M4 **non** dipende da M3: si può fare in parallelo a M3.

## Decisioni da prendere (ADR 0020–0024)

- **ADR 0020 — Versioning e riproducibilità:** cosa identifica una versione (commit, parametri, finestra di addestramento, hash dei dati), dove si salvano gli artefatti, quando si esegue il job (dopo ogni aggiornamento dei risultati, entro i limiti di GitHub Actions).
- **ADR 0021 — Modelli v1:** baseline (per esempio frequenze storiche per lega), Elo, Poisson e Dixon-Coles; come si sceglie il modello "attivo".
- **ADR 0022 — Confidence Score:** definizione e componenti (per esempio qualità e freschezza dei dati, dimensione del campione, calibrazione, accordo tra modelli). Va definito qui: il piano M0 non lo specifica.
- Forma dell'output: per Poisson e Dixon-Coles salvare anche la **matrice dei risultati esatti** (o i parametri per ricostruirla). Serve a M5 per le probabilità congiunte sulla stessa partita.

## Corsia 0 — contratto

**File:** `docs/decisions/0020-…`, `0021-…`, `0022-…`, `docs/data-dictionary/predictions.md`, `supabase/migrations/<timestamp>_predictions.sql`, `supabase/tests/predictions.test.ts`, `packages/shared-types/src/predictions.ts`.

**Contenuto proposto:**

- `model_versions`: modello, versione, commit, parametri, finestra di addestramento, hash dei dati, metriche, stato (`candidate`, `active`, `retired`);
- `predictions`: partita, versione del modello, mercato, selezione, probabilità, Confidence Score, spiegazione (JSON), `created_at`; immutabili;
- `prediction_score_matrices` (o campo equivalente): matrice dei risultati esatti per partita e versione;
- `backtests`: versione, finestra, metriche (Brier, Log Loss, calibrazione), data;
- viste per l'interfaccia: previsione attiva per partita, metriche per versione;
- RLS: lettura per utenti autenticati attivi; scrittura solo dal motore; cambio del modello attivo solo con il permesso `models.manage` (già presente in `packages/shared-types/src/roles.ts`).

**Fatto quando:** CI verde, migrazione su DEV, ADR scritti, test RLS.

## Corsia A — motore (Python)

**File di proprietà:** `services/prediction-engine/**` (nuovo), `.github/workflows/prediction-engine.yml` (nuovo), job Python di CI per questo servizio (PR dedicata su `ci.yml`), `tests/backtesting/**`.

| Fase | Contenuto                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1   | Scheletro del servizio (`pyproject.toml`, lint, test), lettura dello storico, costruzione delle feature con controllo anti-leakage                                                                     |
| A2   | Baseline ed Elo, con test                                                                                                                                                                              |
| A3   | Poisson e Dixon-Coles; derivazione dei mercati v1 dalla matrice dei risultati (1X2, doppia chance, DNB, Over/Under, Goal/No Goal, gol squadra, risultato esatto, handicap europeo e asiatico con push) |
| A4   | Calibrazione e backtest temporale (walk-forward), confronto con la baseline, salvataggio in `backtests`                                                                                                |
| A5   | Versioning, spiegazioni, Confidence Score; job schedulato che scrive le previsioni delle partite in arrivo                                                                                             |

**Fatto quando:** i criteri di completamento in cima sono verificati da test e dal backtest su dati reali di DEV.

## Corsia B — interfaccia

**File di proprietà:** `apps/web/src/app/(app)/models/**`, `apps/web/src/lib/predictions/**`, `apps/web/src/components/predictions/**`, le chiavi `modelIntelligence` e `predictions` di `it.ts`, la riga della voce in `nav-config.ts`. Il pannello previsioni nel dettaglio partita di Match Center (file di M2) si aggiunge con un componente in `components/predictions/` e una sola riga nella pagina di M2, concordata con chi ha fatto M2.

| Fase | Contenuto                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| B1   | Letture lato server delle viste del contratto                                                                           |
| B2   | Model Intelligence: versioni, metriche, grafici di calibrazione, confronto con la baseline                              |
| B3   | Pannello previsioni nel dettaglio partita: probabilità per mercato, Confidence Score, spiegazione, versione del modello |
| B4   | Azione "imposta come modello attivo" riservata a chi ha `models.manage`, con audit                                      |

**Fatto quando:** voce Model Intelligence attiva, previsioni reali visibili su DEV con versione e spiegazione.

## Limiti noti

- Con i dati gratuiti della stagione in corso ci sono solo i risultati: i modelli sono basati sui gol. Mercati su corner, cartellini e giocatori restano "non valutabili" (ADR 0005).
- I minuti di GitHub Actions sono limitati: addestramenti pesanti vanno fatti con parsimonia.

## Chiusura di M4

1. Corsie unite su `dev`, deploy DEV verde, job del motore in esecuzione.
2. Backtest su DEV con metriche migliori della baseline.
3. Stato aggiornato in `README.md`, `CLAUDE.md` e nella [roadmap](README.md).
