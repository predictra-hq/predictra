# ADR 0058 — Comunità: commenti alle partite, maggiore età dichiarata, stile del nome

- **Stato:** proposto (17/11/2026, richiesta di `Alfry1299`). **Servono le decisioni del proprietario** elencate sotto prima del merge del contratto.
- **Milestone:** M8 (corsia 0 per il contratto, corsia B per l'interfaccia)

## Contesto

Richiesta: aggiungere dati all'utenza (anno di nascita o compleanno) per sbloccare un forum o una piccola chat, e un nome utente con colore e scritta a scelta. PREDICTRA parla di scommesse: uno spazio di discussione deve restare per adulti e non deve esporre dati personali.

## Decisione

**1. Data di nascita** in una tabella separata, `user_birthdays`, con RLS **solo proprietario**: nemmeno gli amministratori la leggono, come bankroll e giocate. Il database sa dire solo «l'utente corrente è maggiorenne» (`app_private.is_adult_user()`). Gli altri iscritti vedono al più il nome di chi compie gli anni oggi, e solo se l'utente lo attiva (`show_birthday`, spento per default), mai data né età (`birthdays_today()`).

**2. Commenti sotto le partite** (`match_comments`) invece di una chat in tempo reale:

- li leggono e li scrivono solo gli utenti attivi che hanno dichiarato almeno 18 anni;
- i commenti degli altri si leggono solo da `match_comment_feed()`, che restituisce testo, data, nome visualizzato e stile: mai email né id dell'autore;
- 500 caratteri al massimo, al più 10 commenti in 5 minuti (nel database);
- l'autore cancella i propri commenti; nessuna modifica dopo la pubblicazione;
- **moderazione:** un amministratore con 2FA cancella un commento altrui con `moderate_match_comment()`; resta traccia in `audit_logs` (senza il testo).

**3. Stile del nome:** `profiles.name_color` e `profiles.name_style`, da elenchi chiusi (8 colori, 4 scritte). I colori sono token del tema verificati dal test dei contrasti in entrambi i temi; nessun colore libero, per non avere nomi illeggibili.

## Decisioni che servono dal proprietario

- **Età dichiarata, non verificata.** Non c'è un modo gratuito e affidabile di verificarla senza documenti; l'interfaccia lo dice. Va bene così per una piattaforma su invito?
- **Moderazione:** gli amministratori possono cancellare i commenti altrui (non leggono nulla di più di quanto vede ogni iscritto). Serve anche un regolamento scritto?
- **Conservazione:** i commenti restano finché l'autore non li cancella o l'account non viene eliminato. Va decisa una durata?
- **Nome visibile agli altri:** finora il nome visualizzato lo vedevano solo gli amministratori; con i commenti lo vedono gli iscritti maggiorenni. Chi non vuole usa un nome di fantasia (Preferenze).

## Alternative scartate

- **Chat in tempo reale** (Supabase Realtime): più difficile da moderare, connessioni aperte che consumano il piano gratuito. Può arrivare dopo, sulla stessa regola della maggiore età.
- **Solo l'anno di nascita:** non permette i compleanni e rende il controllo dei 18 anni approssimato.
- **Colori del nome liberi:** illeggibili in uno dei due temi.

## Conseguenze

- Due PR: contratto (`20261117170000_community.sql`, tipi in `packages/shared-types/src/community.ts`, test in `supabase/tests/community.test.ts`) e interfaccia (Preferenze, dettaglio partita, Home).
- Le tabelle nuove restano nel loro ambiente: non vengono copiate da PROD a DEV (`scripts/sync/tables.sh`, ADR 0055).
- Dizionario: [identity.md](../data-dictionary/identity.md). Sicurezza: [security.md](../operations/security.md).
