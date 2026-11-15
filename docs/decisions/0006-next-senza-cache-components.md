# ADR 0006 — Next.js 16 senza Cache Components (per ora)

**Stato:** Accettata · **Data:** 2026-11-07

## Contesto

`create-next-app` (Next.js 16.4) abilita di default `cacheComponents` e `partialPrefetching`. Con Cache Components ogni lettura della sessione deve stare dietro un `<Suspense>` e le route autenticate vanno adattate una per una. In M1 tutte le pagine sono private e dipendono dall'utente.

## Decisione

Disattivare `cacheComponents` e usare il modello di caching classico (rendering dinamico per le pagine autenticate).

## Conseguenze

- Codice di autenticazione più semplice e meno soggetto a errori di caching dei dati personali.
- Va rivalutato da M2–M3, quando esisteranno dati calcistici condivisi e cacheabili (calendari, statistiche).
