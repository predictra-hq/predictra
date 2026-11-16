# ADR 0008 — Nessuna email e deploy automatico da GitHub Actions

**Stato:** Accettata · **Data:** 2026-11-07

## Contesto

- Il proprietario non vuole che la piattaforma invii email: consegna inviti e reset a mano, da un proprio gestionale.
- Nessun SQL e nessuna configurazione manuale a ogni rilascio: Supabase e Vercel devono aggiornarsi da soli.
- Per ora esiste un solo ambiente (DEV).
- GitHub Free sui repository privati non offre né protezione dei branch né _Environments_.

## Decisione

- **Inviti e reset password:** `auth.admin.generateLink` (Auth Admin API, non invia email) produce un `hashed_token`. L'app costruisce il link `/auth/confirm?token_hash=…`, lo mostra **una volta** all'amministratore e non lo salva. Il reset è autorizzato da una RPC (`authorize_password_reset`) con gerarchia, 2FA e audit. La pagina pubblica "password dimenticata" rimanda a un amministratore.
- **Pipeline:** nel workflow `CI`, i job `deploy-dev` e `deploy-prod` (solo su push, dopo `checks` e `secrets`) chiamano `deploy-target.yml`:
  1. `supabase db push`;
  2. `supabase config push` (Auth da `supabase/config.toml`; la CLI tocca solo le proprietà dichiarate);
  3. `vercel build/deploy --prebuilt --prod`.

  Ogni ambiente ha un proprio progetto Supabase e un proprio progetto Vercel. I segreti usano i prefissi `DEV_` e `PROD_`; senza segreti il deploy viene saltato con un avviso.

- I deploy automatici di Vercel su push sono disattivati (`apps/web/vercel.json`), così l'app non va online prima delle migrazioni.
- Il deploy non usa `workflow_run`, perché funziona solo con il workflow presente sul branch di default.

## Conseguenze

- Nessun SQL manuale e nessuna impostazione Auth manuale dopo il setup iniziale.
- Se un utente perde il link prima di usarlo, l'admin revoca e ricrea l'invito, oppure rigenera il link di reset.
- Aggiornamento del 16/11/2026: il link si consuma al tocco di «Continua», non all'apertura ([ADR 0052](0052-link-monouso-consumati-al-tocco.md)).
- Il deploy consuma minuti di GitHub Actions (stimati in 3–5 per push su `dev`).
- Senza protezione dei branch, la disciplina PR → `dev` → `main` è una regola di team, non un vincolo tecnico.
