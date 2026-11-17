# ADR 0054 — Notifiche sul telefono (proposta, non implementata)

- **Stato:** proposto (17/11/2026). Nessun codice scritto: servono le decisioni qui sotto.
- **Milestone:** M8

## Contesto

L'app installata sul telefono non avvisa di nulla quando è chiusa. Gli avvisi esistono già, ma solo dentro l'app: «Da non perdere» in Home (`lib/alerts.ts`) e l'avviso di nuova versione. La piattaforma non invia email (regola 10) e il budget è €0 (regola 7).

## Proposta

Notifiche push del browser (Web Push), gratuite e senza servizi terzi a pagamento:

1. **Service worker** minimo (`public/sw.js`) che riceve la notifica e apre la pagina giusta. Nessuna cache: l'app resta «solo online».
2. **Tabella `push_subscriptions`** (contratto, PR dedicata): utente, indirizzo del servizio push, chiavi del dispositivo. RLS solo proprietario.
3. **Chiavi VAPID:** la pubblica nel frontend, la privata come segreto (`DEV_`/`PROD_`). Le crea il proprietario.
4. **Invio** da `/api/jobs/cycle` (QStash, ogni 15 minuti) con la libreria `web-push`.
5. **Preferenze:** un interruttore per tipo di avviso in _Profilo → Preferenze_; spente finché l'utente non le accende.

## Decisioni che servono dal proprietario

- **Lettura dei dati personali lato server.** Per avvisare «la tua giocata si è chiusa» il server deve leggere le giocate di ogni iscritto con la chiave privilegiata, fuori dalla sessione dell'utente. Oggi i dati di bankroll e giocate si leggono solo con la sessione del proprietario. Alternativa che non tocca questa regola: inviare solo avvisi **non personali** (giocate sopra soglia in arrivo, nuova versione), uguali per tutti.
- **Dipendenza nuova** (`web-push`) e **segreto nuovo** (chiave privata VAPID).
- **Service worker:** oggi non c'è per scelta ([interfaccia.md](../operations/interfaccia.md)). Va deciso se introdurlo solo per le notifiche.
- **Contenuto delle notifiche:** passano dai server di Apple e Google. Devono restare generiche (mai importi né nomi di bankroll).

## Limiti noti

- Su iPhone funzionano solo con l'app aggiunta alla schermata Home (iOS 16.4 o successivo) e dopo un consenso esplicito dato con un tocco.
- La cadenza è quella di QStash: un avviso può arrivare fino a 15 minuti dopo.
- Non si può provare senza un telefono reale e senza le chiavi.

## Conseguenze se accettata

Tre PR: contratto (tabella), invio (corsia A), interfaccia (iscrizione e preferenze). Aggiornare `security.md`, `ambienti.md` (segreti) e la checklist di produzione.
