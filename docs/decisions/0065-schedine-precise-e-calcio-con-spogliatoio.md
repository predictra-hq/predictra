# ADR 0065 — Schedine più precise, meno proposte con valore, Spogliatoio sotto Calcio

- **Stato:** accettato (23/11/2026)
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)
- **Aggiorna:** ADR 0025 e 0036 (soglie e posti delle proposte con valore), ADR 0037 (profili delle schedine consigliate), ADR 0057 (verifica storica), ADR 0064 (posizione e indirizzo dello Spogliatoio)

## Contesto

- Il proprietario vuole schedine «precise» e che rendano. Nel turno del 20–23/11 una sola schedina consigliata su quattro è uscita. Le perse cadevano su giocate che il modello vedeva più sicure di quanto fossero (l'under 3,5, ADR 0063) o su risultati a sorpresa.
- Nessun modello garantisce la vincita. Si può però scegliere meglio: usare quanto sono uscite davvero le giocate dello stesso tipo e scartare quelle su cui modello e bookmaker non sono d'accordo.
- Le proposte con valore erano troppe: fino a 8 per categoria e turno, con selezioni dal 20%.
- Lo Spogliatoio stava sotto Home, e sul telefono non si trovava. L'indirizzo `/community` non diceva cosa fosse.

## Decisione

1. **Verifica storica per mercato e fascia** (`reliability.py`, versione 2 del riepilogo).
   - Per ogni mercato (1X2, doppia chance, gol 1,5–2,5–3,5, entrambe segnano) e fascia di probabilità (50, 60, 70, 75, 80, 85, 90%) si contano le giocate date e quelle uscite, su tutte le partite rigiocate nel backtest. Il conteggio finisce in `backtests.reliability.market_bands`.
   - Un backtest con il riepilogo della versione 1 si rifà al ciclo successivo.
2. **Correzione delle probabilità nelle schedine** (`apps/web/src/lib/bet-builder/calibration.ts`).
   - La probabilità del modello si moltiplica per uscite ÷ previste della sua cella, con un peso a priori di 100 giocate verso il valore dato.
   - Si corregge solo con almeno 200 giocate, al massimo di 8 punti verso il basso e di 3 verso l'alto.
3. **Scelta delle giocate.**
   - Modello corretto e mercato senza margine devono distare al massimo 10 punti.
   - Punteggio = probabilità + valore: prima la precisione, poi il valore.
   - Resta il vincolo che la schedina non perda in media (valore ≥ 0).
4. **Profili delle schedine consigliate:**

   | Profilo       | Probabilità minima per giocata | Quota minima | Partite |
   | ------------- | ------------------------------ | ------------ | ------- |
   | Doppia sicura | 72%                            | 1,20         | 2       |
   | Solida        | 66%                            | 1,25         | 3       |
   | Equilibrata   | 58%                            | 1,45         | 3       |
   | Alta quota    | 45%                            | 1,80         | 4       |

   La «Lunga» a 6 partite è tolta: con sei esiti al 55% vince meno di 3 volte su 100.

5. **Proposte con valore**, regole `2026.11.23-1`: al massimo 2 per turno e categoria (erano 8), selezioni dal 35% (erano dal 20%), combinazioni dal 15% (erano dal 10%).
6. **Interfaccia:**
   - schedine disegnate come biglietti;
   - Spogliatoio all'indirizzo `/locker-room`, nel gruppo Calcio; `/community` e `/discussions` reindirizzano;
   - Squadre diventa una scheda di Campionati.

## Conseguenze

- Le Passate si ricostruiscono con le regole attuali (ADR 0062). Dal 23/11/2026 mostrano quindi quello che le nuove regole avrebbero proposto nei turni già giocati: è una prova delle regole, non lo storico di quanto mostrato allora.
- Finché il backtest non ha le celle della versione 2, le schedine usano la probabilità senza correzione. Il backtest si rifà al primo ciclo del motore dopo il rilascio.
- Possono esserci turni con meno schedine o meno proposte: meglio nessuna che una debole.
