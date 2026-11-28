# ADR 0081 — Spogliatoio in tempo reale, «Costruiscila per me», feedback e sostegno

- **Stato:** proposto (28/11/2026)
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)
- **Aggiorna:** ADR 0064 e 0070 (Spogliatoio), ADR 0042 (Chiedi a PREDICTRA), ADR 0026 (Costruisci)

## Contesto

Richieste del 28/11/2026:

- la chat dello Spogliatoio deve aggiornarsi da sola, senza ricaricare la pagina;
- accanto al nome deve comparire il ruolo, ma solo per Admin e Super Admin;
- serve un'opzione che costruisca la schedina dai dati, con un'analisi in parole semplici (è sicura o no) e la possibilità di chiedere a PREDICTRA il rischio o cosa cambierebbe;
- il pulsante «Incolla codice» della 2FA sul computer è inutile;
- serve una sezione per lasciare un feedback o fare una donazione.

## Decisione

1. **Tempo reale con Supabase Realtime (Broadcast privato):**
   - i trigger su `community_posts`, `community_reactions` e `match_comments` chiamano `realtime.send` e mandano sul canale `community:general`, `community:slips` o `community:matches` solo l'evento `changed` con `{kind}`: nessun testo, nome o id;
   - la policy `community_live_read` su `realtime.messages` lascia ascoltare solo gli iscritti attivi, e solo quei tre canali;
   - nel browser `LiveRefresh` ascolta il canale e, all'avviso, ricarica la chat dal server (`router.refresh`): i messaggi passano sempre da `community_feed`, con le sue regole;
   - il client nel browser (`lib/supabase/browser.ts`) usa la chiave publishable, legge la sessione dai cookie e non la rinnova (il rinnovo resta al proxy). Non legge né scrive dati;
   - se Realtime non risponde, il messaggio si salva lo stesso (eccezione ignorata nel trigger) e la chat si aggiorna tornando sulla pagina. Si riprova il collegamento ogni 15 secondi.
   - Piano gratuito di Supabase: 200 connessioni contemporanee e 2 milioni di messaggi al mese, molto sopra l'uso previsto. Nessun costo.
2. **Ruolo accanto al nome:** `community_feed` restituisce `author_role`, che vale `ADMIN` o `SUPER_ADMIN` (il più alto) oppure `null`. Il ruolo di un utente normale non si espone.
3. **«Costruiscila per me»** in Costruisci (`lib/bet-builder/auto.ts`, logica pura):
   - si sceglie il livello (Prudente, Equilibrata, Aggressiva) e, se si vuole, il numero di partite (2–6);
   - per ogni partita la giocata più probabile del modello attivo, con quota reale, Confidence Score almeno 0,4 e probabilità tra 50% e 90% (gli stessi limiti di «Le più probabili»), mai due volte la stessa squadra;
   - senza numero di partite si prende la schedina più lunga che resta sopra la soglia del livello; con un numero fisso la pagina dice se il livello raggiunto è diverso.
   - **Analisi:** giudizio in parole («Abbastanza sicura», «Rischio medio», «Rischiosa», dalle categorie dell'ADR 0027), «su 100 schedine così ne passerebbero circa N», la giocata più debole e fino a tre modifiche («senza X», «Y al posto di X») con la nuova probabilità e un tocco per applicarle.
   - **Chiedi a PREDICTRA:** un collegamento apre la chat con la domanda già scritta (`/ask?q=`), da inviare con un tocco. I numeri sono quelli del modello; la chat li spiega e non ne calcola altri (ADR 0042).
4. **«Incolla codice» solo su telefono e tablet:** nascosto con un puntatore preciso (`pointer-fine:hidden`). Sul computer si incolla con Ctrl+V in una casella, come prima.
5. **Feedback e sostegno** (`/feedback`, dal Profilo):
   - tabella `feedback`: tipo (idea, problema, apprezzamento, altro), testo 3–1000 caratteri, pagina di partenza (solo un percorso interno), al più 5 all'ora;
   - l'iscritto scrive e rivede solo i propri e non li modifica; gli amministratori li leggono con `admin_feedback_list` (sessione con 2FA), in _Utenti e accessi → Feedback_. Non si inviano email.
   - **Donazione:** un pulsante apre il link in `DONATION_URL` (variabile di Vercel, solo `https`, letta dal server). Senza la variabile il riquadro non compare. La piattaforma non incassa nulla, non vede i dati del pagamento e la donazione non dà vantaggi.

## Conseguenze

- Prima volta di un client Supabase nel browser: solo per Realtime, senza accesso ai dati. La revisione di sicurezza lo riporta.
- Lo stub dei test (`supabase/tests/supabase-stub.sql`) emula `realtime.messages`, `realtime.send` e `realtime.topic()`, così i test verificano avvisi e policy.
- Il tempo reale non si può provare in locale (serve Supabase Realtime): si verifica su DEV con due dispositivi.
- Il link per le donazioni lo decide e lo imposta il proprietario (PayPal.me, Ko-fi o simili), con le relative regole fiscali.
