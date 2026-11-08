# API-Football (API-SPORTS)

**Stato dei termini:** ⛔ **NON VERIFICATI** · **Codice provider:** `api-football` · **Usato in:** M2 corsia A, fase A3 (backfill storico) · **Decisioni:** [ADR 0004](../decisions/0004-fonti-dati-v1.md), [ADR 0010](../decisions/0010-modello-dati-calcio.md)

## Perché non è verificato

Il 7/11/2026 tutte le pagine ufficiali hanno risposto **HTTP 403** alla lettura automatica, con una verifica anti-bot che non va aggirata:

- https://www.api-football.com/terms
- https://api-sports.io/terms
- https://www.api-football.com/pricing
- https://www.api-football.com/documentation-v3

Il piano M0 (§2.1) riporta, da ricerche indirette, 100 richieste al giorno e accesso alle sole stagioni 2022–2024 nel piano Free. Sono informazioni **da confermare**.

Finché questa scheda non è completata:

- `providers.terms_verified_at` resta vuoto e il collector **non** usa il provider;
- la fase A3 del piano M2 è bloccata. Le altre fasi no.

## Da fare (proprietario, a mano da browser)

1. Aprire la pagina dei termini (link in fondo al sito api-football.com o nella dashboard dopo la registrazione).
2. Riportare qui, citando la clausola, cosa dicono su:
   - conservazione dei dati in un proprio database;
   - uso per addestrare modelli statistici;
   - visualizzazione dei dati ad altri utenti;
   - uso commerciale e attribuzione;
   - limiti specifici del piano Free.
3. Dalla dashboard, confermare:
   - richieste al giorno e al minuto;
   - stagioni accessibili;
   - base URL;
   - nome dell'header della chiave.
4. Se i termini consentono l'uso:
   - aprire una PR di contratto con una migrazione nuova che imposta `terms_url` e `terms_verified_at` per `api-football`;
   - aggiornare questa scheda e l'ADR 0010 (§5).

   Se non lo consentono: aggiornare l'ADR 0004 e togliere il provider dal piano M2.
