# ADR 0057 — Schermata «Sei offline» con un service worker minimo

- **Stato:** proposto (17/11/2026, richiesta di `Alfry1299`); accettato con il merge della PR.
- **Milestone:** M8 (corsia B)

## Contesto

Senza rete l'app installata sul telefono mostra la pagina d'errore del browser, che non sembra parte dell'app. Finora non c'era nessun service worker per scelta: PREDICTRA funziona solo online e non deve mostrare dati vecchi come se fossero aggiornati.

## Decisione

Un service worker (`apps/web/public/sw.js`) che fa **una sola cosa**: quando l'apertura di una pagina fallisce per mancanza di rete, risponde con la schermata «Sei offline».

- All'installazione conserva solo `/offline` (`app/offline/route.ts`): una pagina autosufficiente, con stili e simbolo dentro l'HTML, **senza script** e con una CSP propria (`default-src 'none'`). «Riprova» ricarica la pagina chiesta.
- Intercetta solo le aperture di pagina (`mode: navigate`); immagini, dati, codice e chiamate al server passano dalla rete come prima.
- **Nessun dato, nessuna pagina dell'app e nessun file di codice in cache**: l'app resta «solo online» e l'avviso di nuova versione funziona come prima.
- Registrato solo nella build di produzione (DEV e PROD su Vercel), non in sviluppo locale.
- `/sw.js` e `/offline` sono esclusi dal proxy (non contengono dati, il browser li chiede anche senza sessione). La CSP dell'app aggiunge `worker-src 'self'`.

## Alternative scartate

- **Cache delle pagine o dei dati per l'uso offline:** mostrerebbe quote e previsioni vecchie come attuali; contraria al principio dei dati sempre con la loro data di osservazione.
- **Librerie per i service worker** (es. Workbox): una dipendenza in più per 30 righe di codice.

## Conseguenze

- Il service worker resta installato nel browser anche dopo il deploy; per cambiarlo si cambia il nome della cache (`predictra-offline-v1`) e il browser installa la nuova versione da solo.
- La proposta sulle notifiche ([ADR 0054](0054-notifiche-sul-telefono.md)) troverebbe già un service worker: andrebbe esteso, non introdotto.
- Da provare su DEV con un telefono in modalità aereo (vedi [interfaccia.md](../operations/interfaccia.md)).
