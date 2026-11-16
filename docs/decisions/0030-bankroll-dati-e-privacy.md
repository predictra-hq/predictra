# ADR 0030 — Bankroll: modello dati, limiti personali e privacy

**Stato:** Accettata (PR #25; verificata con la chiusura di M6, 8/11/2026) · **Data:** 2026-11-08

## Contesto

- M6 permette a ogni utente di registrare il proprio bankroll e le proprie giocate, reali o simulate, per misurarne i risultati ([piano M6](../roadmap/M6-bankroll-e-tracker.md)).
- PREDICTRA non movimenta denaro e non piazza scommesse (regola 10 di `CLAUDE.md`): è un registro personale compilato a mano.
- Sono dati personali e finanziari: **nessun amministratore**, nemmeno un Super Admin, deve poterli leggere (commento in `roles.ts`, `security.md`).

## Decisione

### 1. Modello dati

- **Più bankroll per utente.** Ognuno ha un nome, una valuta e un **tipo**:
  - `REAL`: giocate reali fatte altrove dall'utente;
  - `SIMULATED`: giocate simulate, solo per prova.

  Le giocate ereditano il tipo dal bankroll: reali e simulate restano separate ovunque (dati, metriche, interfaccia) e non si sommano mai.

- **Valuta:** solo `EUR` nella v1.
- **Movimenti** (`bankroll_movements`), registrati a mano: `DEPOSIT` e `WITHDRAWAL` (importo positivo), `ADJUSTMENT` (importo con segno, diverso da zero).
- **Giocate** (`bets`): data, partita facoltativa (oppure una descrizione libera), mercato, selezione, linea facoltativa, quota decimale > 1, stake > 0, bookmaker facoltativo, stato.
  - Stati: `OPEN`, `WON`, `LOST`, `VOID`, `HALF_WON`, `HALF_LOST`, `CASHED_OUT`.
  - L'**incasso** (`payout`) lo calcola il database dallo stato, salvo `CASHED_OUT` dove lo inserisce l'utente. Il profitto è incasso − stake.
  - Collegamenti facoltativi a una proposta del Bet Builder (M5) e alla probabilità del modello al momento della giocata (M4), utili per le metriche e per Kelly.
  - `closing_odds` facoltativa, per il CLV approssimato (M3, ADR 0015).
- **Saldo** = movimenti + profitto delle giocate chiuse. **Disponibile** = saldo − stake delle giocate aperte.

### 2. Limiti personali

Per ogni bankroll, tutti facoltativi:

| Limite            | Effetto                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `max_stake`       | blocca una giocata con stake superiore                                                             |
| `max_open_bets`   | blocca una giocata oltre il numero di giocate aperte                                               |
| `max_daily_loss`  | blocca nuove giocate se la perdita delle giocate chiuse nelle ultime 24 ore ha raggiunto il limite |
| `max_weekly_loss` | come sopra, sugli ultimi 7 giorni                                                                  |

- I limiti si applicano anche ai bankroll simulati, per abituarsi alla disciplina.
- Il blocco avviene nel database, all'inserimento della giocata, con un messaggio che indica il limite superato.
- **Periodo di riflessione:** nella v1 un limite modificato vale subito. Il ritardo di 24 ore sugli aumenti (pratica di gioco responsabile) è rimandato a un ADR successivo.

### 3. Privacy e accesso

- **RLS solo proprietario** su tutte le tabelle: si leggono e modificano solo i bankroll con `user_id = auth.uid()` e account attivo.
- **Nessuna policy per gli amministratori.** Un eventuale accesso futuro richiederebbe un grant esplicito e tracciato, non un ruolo: è fuori dalla v1.
- **Cancellazione:** l'utente può cancellare le proprie giocate, i movimenti o un intero bankroll (a cascata). Alla cancellazione dell'account i dati si cancellano a cascata.
- Nessun dato del bankroll finisce in `audit_logs`, che gli amministratori possono leggere.

## Conseguenze

- Il Super Admin non vede né gli importi né il numero di giocate degli utenti. Le statistiche aggregate di piattaforma, se servissero, richiederebbero un nuovo ADR con anonimizzazione.
- Il saldo dipende da ciò che l'utente registra: PREDICTRA non lo verifica con i bookmaker.

## Aggiornamento del 16/11/2026: chiusura automatica delle giocate

Una giocata registrata da «L'ho giocata» o dal «+» delle Certezze conserva le selezioni strutturate (`bets.legs`, migrazione `20261116170000`). All'apertura di Giocate fatte, Bankroll o Home l'app confronta le selezioni con i risultati e chiude la giocata: persa appena una selezione è sbagliata, vinta quando tutte le partite sono finite e giuste. Se una partita è rinviata o annullata la giocata resta aperta e decide l'utente.

- La chiusura gira **con la sessione dell'utente** (RLS, solo proprietario): nessun processo di sistema e nessun amministratore legge le giocate, come prima.
- Le giocate scritte a mano non hanno selezioni e restano manuali. Una giocata chiusa a mano non viene toccata.
- Logica pura e testata in `apps/web/src/lib/bankroll/legs.ts`; incasso e saldo restano calcolati dal database.
