# ADR 0076 — Schedine con quote aggiornate, riproducibili, e analisi senza fortuna

- **Stato:** accettato (26/11/2026)
- **Milestone:** M8 (corsie 0, A e B nella stessa modifica)
- **Aggiorna:** ADR 0070 (schedine salvate), ADR 0071 (età delle quote), ADR 0072 (valore mostrato), ADR 0073 (analisi), ADR 0064 (Spogliatoio)

## Contesto

La revisione del 26/11/2026 ha trovato quattro punti in cui le schedine consigliate non rispettavano le regole che il resto della piattaforma già segue:

1. **Quote vecchie.** Le schedine, la card in Home, il salvataggio dell'agente e il Costruisci leggevano l'ultima quota di ogni bookmaker senza limite di età. Il Costruisci e il motore (`pipeline.py`) usano solo quote FRESH. Una quota ferma da giorni entrava nel consenso del mercato e, se era la più alta, diventava la quota proposta: il valore risultava gonfiato.
2. **Schedine non riproducibili** (regola 4 del Prompt Master). `recommended_slips` non salvava né la versione del modello né le regole, e a ogni giro l'upsert sovrascriveva quota e probabilità con quelle dell'ultimo giro, cioè con quote quasi di chiusura.
3. **Schedine condivise senza controllo di forma** nel database. Un utente attivo poteva scrivere direttamente una `slip` malformata e rompere lo Spogliatoio e la card in Home per tutti.
4. **Analisi troppo ottimista.** L'intervallo del ritorno trattava come indipendenti schedine che condividono partite. Le griglie di regole alternative mostravano le varianti migliori, scelte su 3–5 schedine ciascuna.

Inoltre il valore «+0,0%» compariva per schedine con valore nullo, mentre l'ADR 0072 lo vuole solo se positivo.

## Decisione

1. **Quote aggiornate** (`freshOdds` in `lib/bet-builder/bollette.ts`): schedine, Home, salvataggio e Costruisci usano solo quote lette nelle ultime 26 ore (`ODDS_MAX_AGE_MS`, come la freschezza di `the-odds-api`, ADR 0071). Le partite che iniziano entro 15 minuti non si propongono (`KICKOFF_MARGIN_MS`, come il motore).
2. **Valore mostrato** solo se positivo dopo l'arrotondamento a un decimale (`hasPositiveValue`), nella pagina e nella card in Home.
3. **Schedine riproducibili** (migrazione `20261126110000`):
   - nuove colonne `model_version_id`, `rules_version`, `rules` e `relax_step`;
   - ogni giocata salva anche la probabilità del modello e quella del mercato, l'ora della quota, la versione del modello e il momento della previsione;
   - la versione delle regole è `SLIP_RULES_VERSION`, da cambiare a ogni modifica di profili, soglie, peso del mercato o filtri delle quote;
   - **proposta immutabile**: un giro successivo con la stessa schedina aggiorna solo `last_seen_at` (trigger `recommended_slips_keep_proposal`). La copia da PROD a DEV sospende i trigger e non ne è toccata.
4. **Schedine condivise** (migrazione `20261126100000`): vincolo `community_posts_slip_shape`, uguale a `parseSharedSlip` (titolo di 1–60 caratteri, da 1 a 12 giocate con partita e giocata in testo, quota e probabilità numeriche). Vale per i nuovi messaggi. In lettura l'app passa ogni schedina da `parseSharedSlip` e scarta quelle non conformi già scritte.
5. **Analisi onesta** (`lib/analysis/stats.ts`, usato da `slips.analysis.ts`):
   - intervallo al 95% del ritorno con bootstrap a gruppi di schedine collegate da partite comuni, con il numero di gruppi indipendenti;
   - taratura di tutte le giocate insieme (z delle uscite rispetto alle probabilità) e confronto appaiato del Brier tra modello e mercato sulle stesse giocate;
   - delle griglie di regole alternative solo la distribuzione dei ritorni (mediana, 10° e 90° percentile, quante positive), mai la variante migliore;
   - **regola di stop:** nessun cambio di profili o peso del mercato dall'analisi finché le partite già decise sono meno di 300. Lo script dice se la soglia è raggiunta.

## Conseguenze

- In alcune ore ci sono meno schedine: se le quote del giorno non sono ancora state raccolte, una partita non entra. È voluto: meglio niente che una quota vecchia.
- Le Passate mostrano la quota della prima proposta, non l'ultima prima delle partite. Le schedine salvate prima del 26/11/2026 restano come sono, con le colonne nuove vuote.
- I numeri dell'analisi avranno intervalli più larghi di prima: sono quelli veri.
- Non cambia: il modello, i profili (ADR 0072) e il peso del mercato (ADR 0073).
