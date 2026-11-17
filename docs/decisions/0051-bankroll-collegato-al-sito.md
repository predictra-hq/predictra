# ADR 0051 — Bankroll collegato al sito dove si gioca

- **Stato:** accettato (richiesta del proprietario, 16/11/2026)
- **Milestone:** M6 (bankroll), M5 (schedine)

## Contesto

Schedine e Certezze mostravano la migliore quota tra i bookmaker italiani raccolti. Chi gioca su un solo sito vedeva quote che non poteva giocare, e in «L'ho giocata» doveva correggerle a mano nel modulo delle Giocate fatte.

## Decisione

1. Ogni bankroll indica il sito dove si gioca. Alla creazione è obbligatorio; i bankroll già esistenti lo indicano dalla pagina Bankroll.
2. Il sito è uno dei bookmaker italiani di cui PREDICTRA raccoglie le quote (`bookmaker_code`) oppure un nome scritto a mano (`bookmaker_name`), per i siti non raccolti. Nessun bookmaker viene aggiunto a mano all'elenco: l'elenco è quello della tabella `bookmakers`.
3. Vale il sito del bankroll di riferimento (il primo reale, altrimenti il primo), lo stesso usato per la puntata consigliata.
4. Con un sito raccolto, Schedine, Certezze e dettaglio partita mostrano **la quota di quel sito quando c'è**, altrimenti la migliore italiana. Ogni selezione dice sempre da quale bookmaker viene la quota.
5. Accanto alla puntata c'è la quota, modificabile: parte da quella proposta e l'utente la corregge se il suo sito ne offre un'altra. «L'ho giocata» registra puntata, quota e sito scelti.

## Alternative scartate

- **Mostrare solo le quote del sito dell'utente.** Con un sito non raccolto, o raccolto solo su alcune partite, schedine e certezze resterebbero vuote.
- **Aggiungere a mano i siti mancanti con le loro quote.** Sarebbero quote non provenienti da una fonte: vietato dalla regola «mai dati inventati».

## Conseguenze

- Migrazione `20261116150000_bankroll_bookmaker.sql`: due colonne su `bankrolls` e in fondo a `v_bankroll_summary`. RLS invariata (solo proprietario).
- Valore atteso e puntata consigliata si calcolano sulla quota mostrata, quindi su quella del sito dell'utente quando c'è.
- La verifica storica delle Certezze continua a usare la migliore quota italiana: è una misura del metodo, non del singolo utente.
- Limite: le quote si raccolgono nelle 48 ore prima delle partite (ADR 0032). Prima di allora la quota proposta può essere vecchia e va ricontrollata sul sito.

## Aggiornamento del 17/11/2026: elenco dei siti italiani

Segnalazione del proprietario: nel menu del bankroll compariva solo Codere.

- **Causa.** Il menu elencava solo i bookmaker italiani di cui raccogliamo le quote. La fonte (The Odds API, regione `eu`) ne ha oggi uno solo, Codere (IT); Unibet (IT) è documentato ma non compare nelle risposte.
- **Correzione.** Il menu ha due gruppi: «Con le quote in PREDICTRA» (dalla tabella `bookmakers`) e «Altri siti italiani (quote non raccolte)», un elenco fisso di nomi in `apps/web/src/lib/bankroll/sites.ts` (Snai, Sisal, Eurobet, Bet365…). Per questi si salva solo il nome, come per il nome scritto a mano: nessuna quota inventata, si mostra la migliore quota italiana raccolta e la si corregge registrando la giocata. Resta il campo per scrivere un sito che non è in elenco.
