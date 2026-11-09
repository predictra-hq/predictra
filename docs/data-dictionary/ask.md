# Data dictionary — Ask PREDICTRA (M8)

Migrazione: `supabase/migrations/20261109100000_ask.sql` · Decisione: [ADR 0042](../decisions/0042-ask-predictra.md) · Tipi: `packages/shared-types/src/ask.ts`, verificati da `supabase/tests/ask.test.ts`.

Regole:

- **Solo contatori:** il testo delle domande e delle risposte **non** si salva da nessuna parte.
- **Solo proprietario:** ogni utente vede la propria riga; nessuna policy per Admin o Super Admin.
- **Scritture solo tramite RPC** `SECURITY DEFINER`: nessun `INSERT`, `UPDATE` o `DELETE` diretto. Il limite giornaliero è nel database (`app_private.ask_daily_limit()`, 30 domande), non nel client.
- **Anon e utenti sospesi:** nessun accesso.

## Tabelle

| Tabella     | PK                 | FK                            | Colonne e vincoli                                                                                                                     | Retention         |
| ----------- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ask_usage` | (`user_id`, `day`) | profiles (`user_id`, cascata) | `day` in UTC; `questions` ≤ limite giornaliero; `tokens` usati dal fornitore; `rejected` = risposte scartate dal controllo sui numeri | da definire in M8 |

## Funzioni

| Funzione                           | Chi           | Cosa fa                                                                                                     |
| ---------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `ask_consume()`                    | utente attivo | consuma una domanda della quota di oggi e restituisce quelle rimaste; errore `ASK_QUOTA_EXCEEDED` se finita |
| `ask_record(p_tokens, p_rejected)` | utente attivo | aggiunge i token usati e, se la risposta è stata scartata, incrementa `rejected` sulla riga di oggi         |
