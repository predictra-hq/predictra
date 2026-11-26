# ADR 0077 — Step-up 2FA per le azioni distruttive

- **Stato:** accettato (26/11/2026); da provare su DEV con un login reale (§ «Verifica»)
- **Milestone:** M8 (sicurezza, corsie 0 e B)
- **Aggiorna:** la 2FA dell'area amministrativa di M1 (`docs/operations/security.md`, piano M1), `docs/operations/checklist-produzione.md` §1

## Contesto

Le azioni amministrative richiedono una sessione `aal2`, cioè un login completato con il codice TOTP. La sessione però dura giorni: chi trova un computer lasciato aperto con un amministratore collegato può sospendere utenti, cambiare ruoli, generare link di reset della password o cambiare il modello attivo. La checklist di produzione chiedeva uno step-up: una nuova conferma con il codice per le azioni distruttive.

## Decisione

1. **Quattro azioni** chiedono un codice TOTP verificato negli ultimi **5 minuti**: sospensione e riattivazione (`set_account_status`), cambio di ruolo (`set_user_role`), link di reset della password (`authorize_password_reset`) e attivazione di un modello (`set_active_model_version`). Inviti, revoche, alias e moderazione restano con la sola sessione `aal2`.
2. **Il controllo sta nel database** (migrazione `20261126120000`): `app_private.assert_recent_mfa()` legge dal JWT il claim `amr`, che Supabase compila con i metodi di accesso e il momento dell'ultima verifica (`{"method": "totp", "timestamp": …}`). Se manca un TOTP o è più vecchio di 5 minuti, solleva `42501` con hint `STEP_UP_REQUIRED`. Non si usa `iat`, che cambia a ogni rinnovo del token. Le quattro RPC sono ridefinite con lo stesso corpo e una riga in più.
3. **Nell'app** i moduli delle quattro azioni hanno il campo facoltativo «Codice dell'app di autenticazione» (`StepUpField`). Se è compilato, `refreshStepUp` (`lib/auth/step-up.ts`) lo verifica con `mfa.challengeAndVerify` sulla sessione corrente, con lo stesso limite di tentativi del login (10 in 15 minuti), e poi chiama la RPC con il token aggiornato. Entro 5 minuti da un codice si può lasciare vuoto.
4. **Test** (PGlite): l'harness mette nel JWT `amr` con la password e, per `aal2`, il TOTP con un'età scelta dal test. Coperti: codice di 4 minuti fa accettato, di 6 minuti fa e assente rifiutati, azioni non distruttive senza step-up.

## Verifica

Il comportamento di Supabase Auth (che una nuova verifica del codice su una sessione `aal2` aggiorni il momento del TOTP in `amr`) non si può provare in CI. Da fare su DEV con un account amministratore:

1. login con il codice, poi aspettare più di 5 minuti;
2. sospendere un utente di prova senza codice: deve comparire «Per questa azione conferma con il codice dell'app di autenticazione»;
3. ripetere con il codice: l'azione riesce;
4. entro 5 minuti, riattivarlo senza codice: riesce.

Se il punto 3 non riesce, l'aggiornamento di `amr` non avviene come previsto: si torna al comportamento precedente con una migrazione che toglie la riga dello step-up, e si cerca un'alternativa.

## Conseguenze

- Un amministratore che lavora a lungo inserisce un codice ogni 5 minuti per le azioni distruttive.
- Limite: lo step-up dimostra che chi agisce aveva il telefono negli ultimi 5 minuti, non che ha confermato proprio quell'azione.
- Una nuova azione distruttiva deve chiamare `app_private.assert_recent_mfa()` dopo `assert_admin_session()` e mostrare `StepUpField`.
