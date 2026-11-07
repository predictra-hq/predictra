# The Odds API

**Verificato il:** 7/11/2026 · **Codice provider:** `the-odds-api` · **Usato in:** M3 corsia A · **Decisioni:** [ADR 0004](../decisions/0004-fonti-dati-v1.md), [ADR 0015](../decisions/0015-quote-v1.md)

## Termini d'uso

Fonte: https://the-odds-api.com/terms-and-conditions.html ("Last updated: 31 August 2026"). Legge applicabile: New South Wales, Australia.

| Tema               | Cosa dicono                                                                                                         | Cosa comporta per PREDICTRA                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Conservazione      | consentito conservare i dati "indefinitely"                                                                         | storico in `odds_snapshots`                             |
| Visualizzazione    | consentita in UI, siti, app e dashboard, anche per uso commerciale                                                  | Market Intelligence                                     |
| Valori derivati    | consentito calcolare e mostrare valori derivati                                                                     | margine e probabilità implicite (ADR 0016)              |
| Modelli            | consentito l'addestramento di modelli statistici e di machine learning                                              | M4                                                      |
| Rivendita          | vietato rivendere o ridistribuire i dati come prodotto a sé, anche tramite una propria API, feed o file scaricabili | nessuna esportazione grezza delle quote                 |
| Attribuzione       | non obbligatoria, ma apprezzata                                                                                     | si mostra comunque "Quote: The Odds API"                |
| Chiave             | va tenuta privata; può essere revocata in caso di violazioni sospette                                               | solo nel segreto GitHub `ODDS_API_KEY`                  |
| Gioco responsabile | richiesto solo se il servizio promuove bookmaker                                                                    | PREDICTRA non promuove bookmaker e non piazza scommesse |

## Piano Starter (gratuito)

Fonti: https://the-odds-api.com/#get-access e https://the-odds-api.com/liveapi/guides/v4/.

- **500 crediti al mese**, tutti gli sport, la maggior parte dei bookmaker, tutti i mercati.
- Storico delle quote: solo nei piani a pagamento.
- Costo di `/v4/sports/{sport}/odds`: **mercati × regioni**. Un gruppo di 10 bookmaker indicati con `bookmakers` vale come una regione.
- Le richieste che non restituiscono eventi non consumano crediti.
- `/v4/sports` e `/v4/sports/{sport}/events` sono gratuiti.
- Ogni risposta ha gli header `x-requests-remaining`, `x-requests-used`, `x-requests-last`.

## API v4

| Voce             | Valore                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Host             | `https://api.the-odds-api.com`                                                                   |
| Autenticazione   | parametro di query `apiKey`                                                                      |
| Quote            | `GET /v4/sports/{sport}/odds/?apiKey=…&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso` |
| Eventi           | `GET /v4/sports/{sport}/events` (gratuito)                                                       |
| Mercato 1X2      | `h2h`: per il calcio include il pareggio                                                         |
| `last_update`    | va usato quello del **mercato**; quello del bookmaker è deprecato                                |
| Partite concluse | non restituite da `/odds`                                                                        |

L'esempio di risposta nella documentazione riguarda l'NFL (due esiti). Il nome esatto dell'esito "pareggio" nel JSON del calcio **non è verificato** (probabilmente `Draw`): va confermato con la prima risposta reale. L'adapter lo riconosce come l'esito che non coincide con nessuna delle due squadre.

## Bookmaker della regione `eu`

Fonte: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html. La regione `it` non esiste.

- **Versioni italiane:** `codere_it` (Codere (IT)), `unibet_it` (Unibet (IT)).
- **Riferimento statistico:**
  - 1xBet, 888sport, Betclic (FR), BetAnySports, Betfair Exchange, BetOnline.ag;
  - Betsson, Bet Victor, Coolbet, Everygame, GTbets, LeoVegas (SE);
  - Marathon Bet, Matchbook, MyBookie.ag, NordicBet, Pinnacle (quote dal sito pubblico, con possibile ritardo), PMU (FR);
  - Tipico (DE), Unibet (FR), Unibet (NL), Unibet (SE), William Hill, Winamax (DE), Winamax (FR).

Il provider avverte che alcuni bookmaker possono mancare per gli sport meno popolari o sparire occasionalmente dalla risposta. L'autorizzazione ADM dei bookmaker non è verificata da PREDICTRA.

## Chiavi delle competizioni

Fonte: https://the-odds-api.com/sports-odds-data/sports-apis.html. La tabella di corrispondenza con i codici football-data.org è nell'[ADR 0015](../decisions/0015-quote-v1.md).

## Da confermare con la chiave

- Il nome dell'esito pareggio nel JSON del calcio.
- I nomi delle squadre restituiti, da abbinare con `team_aliases`.
- Il consumo reale di crediti per chiamata (atteso: 1).
