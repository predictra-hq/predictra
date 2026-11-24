# ADR 0068 — Repository pubblico

- **Stato:** accettato (24/11/2026)
- **Milestone:** M8
- **Aggiorna:** ADR 0050 (deploy dei soli commit del proprietario), ADR 0061 (minuti di GitHub Actions)

## Contesto

Il 23/11/2026 i minuti gratuiti di GitHub Actions dell'organizzazione sono finiti: le pipeline fallivano e l'agente di PROD non raccoglieva più dati. Le alternative erano due: pagare, oppure aspettare il 1° dicembre con PROD ferma una settimana.

Sui repository pubblici le Actions con i runner standard non consumano minuti. Vercel Hobby, che con un repository privato pubblica solo i commit del proprietario (ADR 0050), accetta invece i commit di tutti i collaboratori se il repository è pubblico.

## Decisione

Il repository `predictra-hq/predictra` diventa pubblico. Prima del cambio:

- **Storia riscritta:** le email personali degli autori sono sostituite con gli indirizzi «noreply» di GitHub, e l'email dell'account Google del progetto è tolta dalla documentazione (`git filter-repo`). Nessun file cambia se non `docs/operations/ambienti.md` e il commit di base di `apps/web/release.json`.
- **Scansione dei segreti** di tutta la storia, PR comprese, con gitleaks: nessun risultato. I segreti stanno nei secrets di GitHub, Supabase e Vercel, che restano privati. I dati (utenti, giocate, bankroll) stanno nel database e non diventano pubblici.
- **Workflow:** nessuno usa `pull_request_target`, quindi le PR aperte da estranei girano senza secrets. Nelle impostazioni delle Actions va richiesta l'approvazione per i collaboratori esterni.
- **Deploy:** il controllo sull'autore del commit (ADR 0050) resta solo finché il repository è privato.

## Conseguenze

- Codice, documentazione, ADR e PR sono leggibili da chiunque. Senza una licenza nessuno può riusare il codice legalmente.
- La storia è riscritta: chi ha un clone deve rifarlo.
- Le PR già unite conservano i commit originali, con le email di allora: GitHub non permette di cancellarli. Per toglierli serve un repository nuovo, oppure una richiesta al supporto di GitHub.
- Le pipeline non consumano più minuti: il limite di ADR 0061 resta utile solo se il repository torna privato.
