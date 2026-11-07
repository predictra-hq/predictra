# Setup e deploy — Milestone 1

Guida passo-passo per attivare l'accesso privato. Account, chiavi e configurazioni cloud li crea **il proprietario del progetto**: nessuna chiave va scritta nel repository o condivisa in chat.

## 0. Prerequisiti locali

| Strumento                  | Comando di verifica  | Note                                     |
| -------------------------- | -------------------- | ---------------------------------------- |
| Node.js ≥ 22               | `node --version`     | CI usa Node 22 (`.nvmrc`)                |
| pnpm 10                    | `pnpm --version`     | `npm i -g pnpm@10` se manca              |
| Python 3.12+               | `python --version`   | serve da Milestone 2                     |
| Supabase CLI (facoltativo) | `supabase --version` | per applicare le migrazioni da terminale |

```bash
pnpm install
pnpm check
```

`pnpm check` esegue lint, typecheck, test (inclusi i test di migrazione e RLS su Postgres embedded) e build.

## 1. Progetti Supabase (staging e produzione)

Piano Free: 2 progetti attivi, pausa dopo 7 giorni di inattività, nessun backup automatico (vedi ADR 0002).

1. Crea due progetti: `predictra-staging` e `predictra-prod`, regione UE (es. Frankfurt).
2. **Migrazioni.** Applica in ordine i file di `supabase/migrations/`:
   - con la CLI: `supabase link --project-ref <ref>` e poi `supabase db push`, oppure
   - dalla Dashboard → SQL Editor, incollando ogni file nell'ordine del nome.
3. **Authentication → Sign In / Providers → Email:**
   - _Allow new users to sign up_: **OFF** (nessuna registrazione pubblica).
   - _Confirm email_: ON.
   - Password minima: **12** caratteri.
4. **Authentication → Multi-Factor:** TOTP abilitato (enroll + verify).
5. **Authentication → URL Configuration:**
   - _Site URL_ = `APP_BASE_URL` (es. `https://predictra-xxx.vercel.app`).
   - _Redirect URLs_: aggiungi `http://localhost:3000/**` solo nel progetto di staging.
6. **Authentication → Email Templates:** sostituisci i template con quelli di `supabase/templates/`:
   - `invite.html` → _Invite user_
   - `recovery.html` → _Reset Password_
   - `email-change.html` → _Change Email Address_

   I template puntano a `/auth/confirm` con `token_hash`, verificato lato server.

7. **Scadenza link email** (_Email OTP Expiration_): imposta una durata adatta agli inviti, ad esempio 24 ore. Verifica nella Dashboard il massimo consentito.
8. **SMTP:** il server email integrato di Supabase ha limiti di invio bassi (**limite esatto NON VERIFICATO**). Per uso reale configura un SMTP esterno in _Authentication → SMTP Settings_, con un provider con piano gratuito da verificare in quel momento.
9. **Data API:** lo schema esposto deve restare solo `public`. Lo schema `app_private` non va esposto.
10. Annota URL, chiave _publishable_ e chiave _secret_ (Project Settings → API Keys) per i passi 2 e 3.

## 2. Esecuzione locale

Crea `apps/web/.env.local` partendo da `.env.example`, con i valori del progetto **staging**. Il file è ignorato da git.

```bash
pnpm dev
```

L'app è su http://localhost:3000. Senza sessione reindirizza a `/login`.

## 3. Deploy su Vercel (piano Hobby)

1. Importa il repository GitHub in Vercel. _Root Directory_: `apps/web` (Vercel rileva pnpm e il monorepo).
2. Imposta le variabili d'ambiente per ambiente:
   - **Preview** → valori di staging.
   - **Production** → valori di produzione.

   `SUPABASE_SECRET_KEY` non deve mai avere il prefisso `NEXT_PUBLIC_`.

3. _Production Branch_: `main`. I deploy di `dev` sono Preview.
4. Il piano Hobby è per uso **personale e non commerciale** (ADR 0002).

## 4. Super Admin iniziali (bootstrap)

Si esegue una volta per ciascun Super Admin iniziale, con le variabili d'ambiente di **quel** progetto impostate nel terminale (non salvate su file):

```bash
node apps/web/scripts/bootstrap-super-admin.mjs persona@example.com
```

Ogni persona riceve l'email e la attiva:

1. clic sul link → `/accept-invite`;
2. imposta nome e password;
3. attiva la 2FA (obbligatoria per l'area Administration).

Da quel momento gli inviti successivi si fanno dall'app (_Administration → Inviti_). Tutti i Super Admin hanno privilegi identici: non c'è un proprietario unico.

## 5. GitHub

- **Branch protection** su `main` e `dev`: PR obbligatoria, check "CI / Lint, typecheck, test, build" e "CI / Scansione segreti" obbligatori, niente force push. Si imposta in Settings → Branches.
- I minuti di GitHub Actions sui repo privati sono limitati (~2.000 min/mese Linux). La CI annulla i run superati per risparmiarli.

## Verifica di fine Milestone 1 (manuale, su staging)

- [ ] Login di un Super Admin; attivazione TOTP; logout e login con richiesta del codice.
- [ ] Invito di un `USER` da _Administration → Inviti_; email ricevuta; attivazione.
- [ ] Revoca di un invito in attesa: il link non funziona più.
- [ ] Sospensione dell'utente: al refresh viene mandato a `/suspended` e non può più accedere. Riattivazione.
- [ ] L'utente `USER` non vede l'area Administration; aprendo `/admin/users` torna alla dashboard.
- [ ] Recupero password via email.
- [ ] _Esci dagli altri dispositivi_ chiude le altre sessioni.
- [ ] Audit: le azioni compaiono in _Administration → Audit_.
