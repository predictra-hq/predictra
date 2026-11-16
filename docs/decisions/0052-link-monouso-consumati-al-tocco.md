# ADR 0052 — Link monouso consumati solo al tocco di «Continua»

- **Stato:** proposto (segnalazione su DEV, 16/11/2026)
- **Milestone:** M1 (accesso su invito); aggiorna l'[ADR 0008](0008-niente-email-e-deploy-automatico.md)

## Contesto

I link di invito e di reset password si consegnano a mano (ADR 0008), di solito in una chat. `/auth/confirm` consumava il token appena l'indirizzo veniva aperto. Le app di messaggistica aprono da sole gli indirizzi per mostrarne l'anteprima: il link veniva usato prima del destinatario, che trovava «Link non valido o scaduto» pochi minuti dopo l'invio.

Da lì si bloccava anche il resto:

- la revoca eliminava l'utente auth solo se non aveva mai fatto un accesso, ma l'apertura del link registra un accesso: l'utente restava, senza ruolo e senza password;
- con quell'utente presente, la generazione di un nuovo link di invito per la stessa email veniva rifiutata.

La causa è stata ricostruita dal codice; sui dati di DEV va confermata guardando l'ultimo accesso dell'utente invitato in Supabase.

## Decisione

1. `/auth/confirm` è una pagina con il pulsante **Continua**. Il token si verifica nella Server Action del pulsante (`confirmLink`), non all'apertura dell'indirizzo. Formato del link invariato: quelli già consegnati restano validi.
2. Un utente creato da un invito è «mai attivato» se non ha ruoli e non ha inviti accettati (`removeNeverActivatedUser` in `lib/auth/orphans.ts`). Non conta più l'ultimo accesso.
3. La revoca elimina l'utente mai attivato. La creazione di un invito fa lo stesso, prima di generare il link, per l'eventuale utente rimasto a metà con quella email.

## Conseguenze

- Il destinatario fa un tocco in più.
- L'eliminazione usa la chiave segreta, sempre dopo che una RPC (`create_invitation`, `revoke_invitation`) ha autorizzato l'amministratore. Un ruolo si riceve solo con `accept_invitation`: chi non ne ha non ha mai potuto usare l'app e non ha dati propri. Se una lettura di controllo fallisce non si elimina nulla.
- Nessuna migrazione.
- Un'anteprima che eseguisse JavaScript e premesse il pulsante consumerebbe ancora il link: non è il comportamento delle app di messaggistica note.
- Non verificato nell'app in esecuzione: va provato su DEV con un invito inviato in chat (vedi la checklist di messa in servizio).
