# ADR 0050 — Deploy solo da commit del proprietario (piano Vercel Hobby)

**Stato:** Accettata · **Data:** 2026-11-08 · **Modifica:** [ADR 0009](0009-lavoro-in-parallelo.md) (metodo di merge)

## Contesto

- Budget €0 (regola 7 di `CLAUDE.md`): il piano Vercel Pro non è approvato.
- Sul piano Hobby Vercel non consente la collaborazione su repository privati: rifiuta i deploy il cui autore git non è l'account proprietario. Lo staff di Vercel lo ha ribadito più volte sul forum della community (thread "Vercel Hobby plan deployment blocked because commit author lacks access").
- Il 7/11/2026 i deploy dei commit di `Alfry1299` restavano fermi su `Building…`. La correzione di quel giorno rimuoveva `.git` prima di `vercel deploy`: funzionava, ma nascondeva l'autore e quindi **aggirava il limite del piano**. Non è conforme e va tolta.

## Decisione

- Il deploy pubblica con i metadati git, senza rimuoverli.
- I merge su `dev` e su `main` li fa **solo il proprietario** (`gennpalm`) con **Create a merge commit**: il commit pubblicato è suo. Con _Squash and merge_ l'autore del commit sarebbe chi ha aperto la PR.
- Niente push diretti su `dev` o `main`: si passa sempre da una PR.
- Il workflow di deploy controlla l'autore del commit **prima** delle migrazioni. Se non è il proprietario si ferma subito con un errore che spiega cosa fare.
- Il collega lavora su `feature/*` e apre le PR; il proprietario le guarda e le unisce.

## Conseguenze

- Ogni rilascio passa dal proprietario, che fa anche da revisore.
- La cronologia di `dev` contiene i commit delle PR più un commit di merge per ciascuna.
- **Rischio residuo:** la regola dichiarata da Vercel è "niente collaborazione su repository privati nel piano Hobby". Il controllo tecnico guarda l'autore del commit pubblicato, che con questa decisione è sempre il proprietario. Se Vercel applicasse la regola anche al codice scritto da altri e unito dal proprietario, le alternative a costo zero sono rendere pubblico il repository o cambiare hosting; altrimenti serve il piano Pro (a pagamento, con approvazione del proprietario).
