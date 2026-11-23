# ADR 0064 — Comunità con più chat, schedine condivise e profilo pubblico

- **Stato:** accettato (23/11/2026)
- **Milestone:** M8 (corsie 0, A e B: contratto, database e interfaccia nella stessa modifica)
- **Sostituisce in parte:** ADR 0058 (maggiore età dichiarata per i commenti)

## Contesto

- I commenti stavano solo sotto le partite. Non c'era un posto dove parlare d'altro né dove condividere una schedina con il proprio gruppo.
- La data di nascita sbloccava i commenti (ADR 0058), ma PREDICTRA è solo su invito e gli iscritti li scegliamo noi, tutti maggiorenni. La data quindi era un passaggio in più che non proteggeva nulla.
- Nome, stile del nome e immagine si vedevano bene nel proprio Profilo, poco altrove. Il proprietario vuole che PREDICTRA sia anche social.
- Nel Profilo quattro voci portavano alla stessa pagina, tre alla stessa pagina di sicurezza e quattro alle Preferenze.

## Decisione

1. **Spogliatoio** (`/community`, gruppo Home: sul telefono è una scheda di Home; in Home una card con gli ultimi tre messaggi) con tre chat. Il nome «Comunità» è stato scartato il giorno stesso: Spogliatoio è più da calcio e dice che il gruppo è ristretto, su invito.
   - **Generale**, per parlare di tutto;
   - **Schedine**, con le schedine condivise;
   - **Partite**, con gli ultimi commenti scritti sotto le partite (ex `/discussions`, che reindirizza qui).
2. **Tabella `community_posts`** (migrazione `20261123100000_community_chat.sql`):
   - campi: canale `GENERAL` o `SLIPS`, testo fino a 500 caratteri, schedina facoltativa in JSON (al massimo 4 KB, solo nel canale Schedine);
   - RLS solo proprietario, come per `match_comments`;
   - lettura di tutti con `community_feed()` (`SECURITY DEFINER`), che restituisce nome, colore, stile e immagine, mai email o id;
   - stesso limite dei commenti: 10 messaggi in 5 minuti;
   - moderazione admin con 2FA tramite `moderate_community_post()`, registrata in `audit_logs`.
3. **Condividi una schedina** da Proposte, Passate e Costruisci:
   - _Nello Spogliatoio_ la pubblica nella chat Schedine con un messaggio facoltativo;
   - _In altre app_ apre la condivisione del telefono (WhatsApp, Telegram…) con il testo della schedina, oppure lo copia;
   - la schedina condivisa è un riepilogo (partita, giocata, quota, probabilità), ricontrollato dal server (`lib/community/slip.ts`). Non è un dato nuovo: viene dalle stesse quote e previsioni già mostrate.
4. **Niente data di nascita.**
   - `app_private.is_adult_user()` ora equivale a `is_active_user()`: ogni iscritto attivo legge e scrive.
   - Tolti dall'interfaccia il riquadro, il compleanno in Home e i messaggi «commenti sbloccati».
   - La tabella `user_birthdays` resta nel database, senza nuove scritture dall'app. Per cancellarla serve una migrazione dedicata, con l'autorizzazione del proprietario (regola 9).
5. **Profilo pubblico.** Nome, colore, stile e immagine si vedono accanto a ogni messaggio e commento. Le funzioni di lettura ora restituiscono anche `avatar_style`.
6. **Immagine del profilo uguale al logo.** Ha lo stesso quadrato arrotondato, la stessa linea (`6,23 12,16.5 17,20 23.5,11`) e lo stesso pallone in cinque versioni: logo, logo in verde, pallone, andamento, iniziale. I valori di `avatar_style` non cambiano.
7. **Profilo con una voce per pagina:** Il tuo profilo (nome, immagine e stile insieme, con l'anteprima), Accesso e sicurezza, Preferenze (riepilogo di tema, suoni, avvisi e fuso orario), poi aiuto e amministrazione.

## Conseguenze

- Gli iscritti vedono i messaggi di tutti: le regole d'uso sono scritte sotto ogni chat e gli admin possono rimuovere un messaggio.
- I nuovi dati personali stanno in `community_posts`, che resta nel proprio ambiente come gli altri dati personali (`scripts/sync/tables.sh`, `LOCAL_TABLES`).
- Costruisci: sul computer la barra in basso è tolta, perché la Valutazione a fianco si aggiorna da sola. Le giocate scelte si leggono meglio (giocata in grassetto, poi partita e data) e si tolgono una per una o tutte insieme.
