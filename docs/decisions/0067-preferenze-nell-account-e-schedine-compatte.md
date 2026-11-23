# ADR 0067 — Preferenze nell'account, profilo modificabile dagli admin, schedine compatte

- **Stato:** accettato (23/11/2026)
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)

## Contesto

Richieste del proprietario dopo il rilascio 1.4.0:

- tema, suoni e soglia degli avvisi valevano solo per il browser (cookie); vanno salvati per utente;
- un amministratore non poteva correggere il nome o lo stile di un iscritto;
- i pulsanti «Salva» si potevano premere anche senza modifiche;
- le schedine erano lunghe; le proposte con valore non si potevano giocare ed erano troppe in una pagina sola;
- le pagine avevano larghezze diverse (il Profilo stretto e centrato, la Home larga).

## Decisione

1. **Preferenze nell'account:**
   - tema, suoni e soglia degli avvisi stanno in `user_dashboard_settings.settings` (chiavi `theme`, `sounds`, `alert_threshold`), con RLS solo proprietario, come il tutorial;
   - i cookie restano una copia locale, che serve a disegnare la pagina subito;
   - all'apertura dell'app `AccountSettingsSync` allinea il dispositivo all'account.
   - Lingua e formato delle quote avevano una sola scelta e non compaiono più nelle Preferenze. Il fuso orario mostra accanto l'ora attuale.
2. **Profilo modificato da un amministratore:**
   - lo fa la RPC `admin_update_profile` (migrazione `20261123130000`), che cambia nome visualizzato, colore e scritta del nome e immagine;
   - stesse regole delle altre azioni sugli utenti: sessione admin con 2FA, un Admin non tocca chi ha un ruolo pari o superiore;
   - nel registro finiscono i nomi dei campi cambiati.
3. **Pulsanti senza modifiche spenti:** `ActionForm` con `trackChanges` (profilo, preferenze) accende il pulsante solo quando un valore è diverso da quello salvato. Nella chat il pulsante di invio si accende solo con del testo.
4. **Schedine compatte:**
   - ogni partita su due righe e intestazione su una riga sola;
   - puntata e «L'ho giocata» in un pannello «Gioca questa schedina» che si apre a richiesta;
   - al massimo 3 per riga (`TICKET_GRID`).
   - Anche le proposte con valore si possono giocare: link al Tracker con le partite, come le schedine consigliate (`slipTrackerHref`).
5. **Proposte con valore per fascia di quota:**
   - per ogni turno tre riquadri che si aprono: fino a 3, da 3 a 6, oltre 6;
   - è aperto solo il primo;
   - spariscono i filtri per turno, categoria e puntata.
6. **Stessa larghezza in tutte le pagine:**
   - Profilo, Il tuo profilo, Preferenze, Sicurezza, Chiedi e dettaglio della proposta occupano tutta la colonna come la Home;
   - sul computer i riquadri stanno su due colonne.
7. **Stile «Macchina da scrivere»:** il nome usa un vero carattere a larghezza fissa (`.name-mono`). `.font-mono` nel sito resta il carattere del testo con le cifre allineate.

## Conseguenze

- Un telefono nuovo prende tema, suoni e avvisi dell'account al primo caricamento. La prima pagina può mostrare per un attimo il tema di base.
- La lettura delle impostazioni dell'account avviene a ogni caricamento del layout: una riga per utente, letta per chiave.
