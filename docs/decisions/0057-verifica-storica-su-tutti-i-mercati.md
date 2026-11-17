# ADR 0057 — Verifica storica del modello su tutti i mercati

- **Stato:** accettato (17/11/2026, richiesta del proprietario)
- **Milestone:** M8 (corsie A e B)

## Contesto

La pagina _Affidabilità_ confrontava con i risultati solo le previsioni fatte davvero prima delle partite, dagli ultimi 60 giorni. Le previsioni esistono da pochi giorni e in mezzo c'è stata la pausa per le nazionali: 60 giocate in tutto, con quasi tutte le righe «ancora poche». Il proprietario vuole provare il modello «a un livello altissimo».

Il backtest walk-forward (ADR 0020) rigioca già più di 8.600 partite, ma registrava solo Brier, Log Loss e calibrazione dell'1X2.

## Decisione

1. Durante il backtest walk-forward del modello in gara, per ogni partita rigiocata (previsione fatta solo con le partite precedenti) il motore calcola **tutti i mercati principali** dalla matrice dei risultati e li confronta con il risultato vero (`reliability.py`).
2. Il riepilogo va in una colonna nuova, `backtests.reliability` (migrazione `20261117180000_backtest_reliability.sql`):
   - partite rigiocate; quante volte ha vinto la favorita e con che probabilità media;
   - quante volte è uscito il risultato esatto più probabile;
   - le **giocate dal 70%** (in ogni mercato l'esito più probabile, se dato almeno al 70%, come in _Certezze_) per mercato, campionato, stagione e settimana;
   - la calibrazione per fasce di probabilità su tutti gli esiti.
3. La pagina _Affidabilità_ mostra in alto **«Il modello su tutto lo storico»** (numeri chiave, grafico delle fasce, settimane, per mercato, campionato e stagione) e sotto la verifica sulle partite di queste settimane, come prima.
4. I backtest registrati senza riepilogo si rifanno al primo giro del motore, senza aspettare il confronto settimanale.

## Limiti dichiarati

- È una verifica del **solo modello**: per le stagioni passate non ci sono quote raccolte, quindi niente probabilità combinata con il mercato.
- Le giocate dal 70% sono una per mercato e per partita, senza il filtro delle giocate implicate di _Certezze_: i numeri sono vicini, non identici.

## Costi

Nessun minuto in più apprezzabile: i mercati si calcolano nella stessa passata del backtest settimanale.
