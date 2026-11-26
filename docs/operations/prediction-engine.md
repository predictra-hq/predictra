# Motore di previsione — runbook (M4 corsia A)

Servizio Python in `services/prediction-engine/`. Decisioni: [ADR 0020](../decisions/0020-versioning-previsioni.md), [ADR 0021](../decisions/0021-modelli-v1.md), [ADR 0022](../decisions/0022-confidence-score.md). Dati: [predictions.md](../data-dictionary/predictions.md).

## Come funziona

```text
GitHub Actions "Agent (Python)" (03:47 e 12:47 UTC: job predictions.run della coda, dopo la raccolta dello stesso ciclo, M7)
oppure "Prediction engine" (solo avvio manuale: run, tune, diagnose)
  1. training_results(as_of = adesso)              → partite concluse fino a ora
  2. v_match_center: partite SCHEDULED dei prossimi 10 giorni
  3. per ogni modello (baseline, elo, poisson, dixon_coles), adattato per competizione:
       versione = famiglia + iperparametri + commit del codice del motore
       se la versione è nuova: register_model_version + backtest walk-forward → record_backtest
  4. per ogni modello: start_prediction_run → record_predictions (righe e matrici) → finish_prediction_run
```

- **Versioni.** Una versione non cambia finché non cambiano il codice del motore o i suoi iperparametri. A ogni esecuzione il modello si riadatta in modo deterministico sui dati di `training_results(as_of)`: versione e `as_of` bastano a riprodurre ogni previsione. Così una versione attivata continua a ricevere previsioni giorno dopo giorno.
- **Backtest.** È walk-forward a finestre settimanali, dopo 4 settimane iniziali di solo addestramento. Usa le stesse partite per tutti i modelli e registra Brier, Log Loss, ECE e i valori della baseline. Si esegue una sola volta per versione.
- **Previsioni.**
  - Baseline ed Elo producono solo l'1X2.
  - Poisson e Dixon-Coles producono tutti i mercati della v1 (98 righe per partita) e la matrice dei risultati esatti fino a 10 gol.
  - Ogni riga ha `as_of`, `features_hash` e il Confidence Score con le sue componenti in `explanation`.
- **Anti-leakage:** il database rifiuta previsioni con `as_of` successivo al calcio d'inizio. Il motore legge lo storico solo con `training_results`.

## Un solo modello PREDICTRA (ADR 0024, aggiornato dall'ADR 0039)

Dal 14/11/2026 in gara c'è un solo modello, `dixon_coles` (Dixon-Coles + Elo); Poisson resta solo in `tune`. Il testo sotto descrive la situazione precedente.

In gara ci sono solo **Poisson** e **Dixon-Coles** (dalle versioni del 14/11/2026 Dixon-Coles è combinato con l'Elo, [ADR 0039](../decisions/0039-sfidante-dixon-coles-elo.md)), gli unici che calcolano tutti i mercati del Bet Builder: uno è il modello attivo, l'altro lo sfidante. Baseline ed Elo restano strumenti interni del motore: la baseline come riferimento del backtest, Elo come secondo parere per il Confidence Score. Non si registrano più e non scrivono previsioni. Le versioni superate si ritirano da sole e restano nello storico della pagina.

## Taratura automatica (ADR 0056)

Dal 17/11/2026 il motore ritocca da solo le impostazioni del modello PREDICTRA. Ogni settimana, insieme al confronto dei backtest, prova due varianti vicine su una impostazione per volta a rotazione (ξ, L2, peso dell'Elo) sulle partite degli ultimi sei mesi rigiocate con le sole partite precedenti. Adotta la migliore solo se batte quella attuale di almeno 0,001 di Log Loss, se il miglioramento misurato partita per partita supera due errori standard (dal 26/11/2026, [ADR 0078](../decisions/0078-misure-prima-delle-regole.md)) e se non è peggiore sull'intero storico. Il log riporta per ogni variante `diff = … ± …` (due errori standard). Il log del ciclo riporta le varianti provate e l'esito (`taratura automatica su N partite recenti`); un'adozione crea una versione nuova e compare in _Audit_.

## Modello attivo: automatico (ADR 0023)

Dall'11/11/2026 il motore attiva da solo il modello più forte: tra le versioni del codice corrente che battono la baseline, quella con il Log Loss più basso nel backtest. La cambia se il modello attivo è di un codice superato, oppure se un'altra versione lo batte di almeno 0,001 di Log Loss. Ogni cambio compare in _Audit_ come `model.auto_activated`, con il motivo.

Ogni 7 giorni il motore rifà il backtest di tutti i modelli con i dati aggiornati e ripete la scelta (confronto settimanale).

Una versione nuova nasce solo quando cambia il codice che produce i numeri (`models/`, `data.py`, `markets.py`, `confidence.py`): il log di ogni esecuzione riporta `codice dei modelli: <impronta>`.

L'attivazione manuale descritta sotto resta possibile; il motore la cambia solo se trova un modello più forte.

## Attivare un modello

Il modello attivo è quello mostrato come "previsione PREDICTRA" (`v_active_predictions`). Finché nessuna versione è attiva, la vista è vuota: è il comportamento voluto.

1. Guarda i backtest in `v_model_versions_summary`. `beats_baseline = true` vuol dire Brier e Log Loss migliori della baseline.
2. Un Super Admin con 2FA chiama `set_active_model_version(<id>)`. Il database rifiuta le versioni che non battono la baseline e registra l'attivazione in audit.

La pagina Model Intelligence, con un pulsante di attivazione, arriva con la corsia B di M4. Fino ad allora l'attivazione si fa dall'SQL editor di Supabase.

## Avvio manuale

_Actions → Prediction engine → Run workflow_, branch `dev`.

- `dry_run`: calcola backtest e previsioni senza scrivere nulla e stampa le metriche.
- `horizon_days`: quanti giorni di partite prevedere (predefinito 10).

Dall'8/11/2026 (M7 fase A5) le esecuzioni programmate passano dalla coda dell'agente: finestre `morning` 03–12 UTC e `afternoon` 12–21 UTC, una esecuzione per finestra, al massimo 2 tentativi, il commit calcolato come prima (ultimo commit di `services/prediction-engine`, ADR 0020; nell'agente si chiama `PREDICTION_ENGINE_COMMIT`). Le versioni di numpy e scipy dell'agente sono verificate uguali a quelle del motore da un test ([runbook dell'agente](agent.md)). Come per il Data collector, il pulsante _Run workflow_ esiste solo quando il workflow è su `main`.

## Uso in locale (facoltativo)

```powershell
cd services/prediction-engine
uv sync
uv run pytest
$env:SUPABASE_URL = "https://<ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<chiave secret>"
$env:CODE_COMMIT = (git log -1 --format=%H -- .)
uv run python -m predictra_engine run --dry-run
```

## Budget

- Previsioni: 2 esecuzioni al giorno di pochi minuti.
- Backtest: solo quando cambia il codice del motore.

La stima dell'ADR 0020 è di circa 220 minuti al mese di GitHub Actions; va verificata con le prime esecuzioni reali.

## Diagnosi: cosa vede l'app

Se il pannello "Previsioni PREDICTRA" resta vuoto: _Run workflow_ con `command = diagnose`, oppure `python -m predictra_engine diagnose`. Il comando gira in sola lettura con la chiave secret e mostra:

- versioni, stato, backtest e numero di previsioni;
- la versione attiva;
- le partite in programma nei 10 giorni;
- quante di queste la vista `v_active_predictions` restituisce.

Chiude con un **esito**: nessun modello attivo, versione attiva senza previsioni, vista che non restituisce righe, oppure dati corretti (problema lato utente).

Il pannello stesso indica il motivo quando è vuoto: nessun modello attivo, partita già iniziata o conclusa, oppure partita non ancora valutata dal motore.

## Taratura dei modelli gol

Comando in sola lettura: `python -m predictra_engine tune [--l2 2,3,4] [--xi 0,0.005]`, oppure _Run workflow_ con `command` = `tune` e `tune_args`. Per ogni combinazione esegue lo stesso backtest walk-forward delle versioni, sulle stesse partite della baseline.

**8/11/2026:** 744 partite di addestramento, backtest su 560.

| Modello                                      | Brier      | Log Loss   | ECE       |
| -------------------------------------------- | ---------- | ---------- | --------- |
| baseline                                     | 0,6592     | 1,0902     | 0,035     |
| Elo (K 20, vantaggio 60)                     | 0,6294     | 1,0486     | 0,047     |
| Poisson, L2 0,1 (primo valore)               | 0,6556     | 1,1216     | 0,090     |
| **Poisson, L2 3**                            | **0,6121** | **1,0238** | **0,027** |
| Dixon-Coles, L2 0,1, ξ 0,0019 (primo valore) | 0,6564     | 1,1301     | 0,088     |
| **Dixon-Coles, L2 3, ξ 0,005**               | **0,6133** | **1,0280** | **0,032** |

- Con L2 0,1 i modelli gol erano troppo sicuri di sé, con poche partite per squadra.
- Il risultato è stabile tra L2 2,5 e 5. Oltre 10 i modelli diventano troppo prudenti.
- Valori adottati: **L2 = 3** per Poisson e Dixon-Coles, **ξ = 0,005/giorno** per Dixon-Coles.
- Cambiare gli iperparametri crea versioni nuove, ciascuna con il proprio backtest.
- Ripetere la taratura quando lo storico cresce, per esempio a metà stagione, per non adattare i valori a un solo periodo.

**14/11/2026 ([ADR 0038](../decisions/0038-modello-gol-tempo-e-neopromosse.md)):** con lo storico di quattro stagioni, Poisson usa ξ = 0,0015 e Dixon-Coles ξ = 0,001, e le neopromosse partono da attacco −0,2 e difesa −0,1. Su un banco di prova con dati pubblici (3.483 partite di cinque campionati) il Log Loss 1X2 passa da 0,9928 a 0,9899 per Poisson e da 0,9960 a 0,9897 per Dixon-Coles. Le versioni nuove si confrontano da sole sul database (ADR 0023). Per confermare i valori: `tune` senza argomenti.

## Analisi degli errori giornata per giornata (14/11/2026)

Richiesta del proprietario: rigiocare tutte le partite passate con i modelli attuali, confrontare ogni giornata con il risultato reale e correggere il modello dove sbaglia.

- **Metodo.** Banco di prova dell'[ADR 0038](../decisions/0038-modello-gol-tempo-e-neopromosse.md): 7.061 partite dei cinque campionati principali, 2022–2026. Ogni settimana il modello è addestrato solo sulle partite precedenti; le correzioni sono stimate solo sugli errori passati e verificate sulle giornate successive, mai viste.
- **Errori ricorrenti trovati** (Dixon-Coles + Elo):
  - pareggi un po' sottostimati: 24,4% previsti contro 25,3% reali, di più in Serie A (25,5% contro 27,7%);
  - vittorie in trasferta un po' sopravvalutate: 31,8% contro 30,9%;
  - squadre con meno di 10 partite di storico: più pareggi del previsto (28,3% contro 25,4%).

  Le favorite sono ben calibrate in tutte le fasce. Poisson sottostima di più i pareggi (23,7%; in Bundesliga 21,7% contro 25,2%).

- **Correzioni provate:** spostamenti di casa e pareggio stimati sugli errori passati, per tutti i campionati insieme o per campionato, sulle ultime 760 o 1.520 partite, con penalità diverse; un fattore pareggi per le squadre con poco storico.
- **Esito: nessuna correzione adottata.** I pareggi previsti diventano uguali a quelli reali, ma sulle giornate mai viste il Log Loss di Dixon-Coles + Elo peggiora (da 0,9845 fino a 0,9856). Per Poisson il guadagno massimo è 0,0006, e resta peggiore di Dixon-Coles + Elo senza correzione. Il fattore per le squadre con poco storico, stimato su 2022–24, è 1,02 e migliora 2024–26 di 0,0001. Gli scarti visti a posteriori sono soprattutto caso: l'addestramento sulle partite passate ne incorpora già la parte ripetibile.
- **Cosa può ancora migliorare la precisione:** dati che i modelli oggi non vedono, come statistiche di partita, formazioni e quote di chiusura. Si misurano allo stesso modo prima di adottarli.

## Prove sull'Elo (15/11/2026)

Banco di prova dell'[ADR 0038](../decisions/0038-modello-gol-tempo-e-neopromosse.md) (openfootball, 3.483 partite valutate dal 1/7/2024). Riferimento: Dixon-Coles + Elo (peso 0,4), Log Loss 1X2 **0,9881**; Dixon-Coles da solo 0,9897.

- **Provato:** scarto gol nell'aggiornamento (fattore 1 + m·ln(scarto), m 0,5 e 1), neopromosse più deboli (−60, −100, −150 punti), ritorno verso la media tra le stagioni (20%), K 15–30, vantaggio casa 40–80, peso dell'Elo 0,3–0,6.
- **Elo da solo:** migliora da 0,9950 a 0,9923 (scarto gol 0,5 e neopromosse −100).
- **Nella combinazione:** al massimo 0,9877 (K 25, scarto gol 0,5, neopromosse −100), cioè 0,0004 in meno. È dentro il rumore su 3.483 partite: **nessuna modifica adottata**. Il ritorno verso la media peggiora sempre.
- **Conclusione:** con i soli gol il modello è al suo limite. L'informazione in più viene dalle quote: dal 15/11/2026 la pagina _Certezze_ usa la probabilità combinata modello/mercato (peso 0,5, come il Bet Builder, ADR 0028) e la verifica per fascia sulle partite finite.

## Probabilità alte: calibrazione e sharpening (15/11/2026)

Stesso banco (3.483 partite), Dixon-Coles + Elo, selezioni 1X2 e doppia chance:

| Fascia    | Selezioni | Previsto | Uscito |
| --------- | --------- | -------- | ------ |
| 70–75%    | 2.524     | 72,6%    | 73,2%  |
| 75–80%    | 1.850     | 77,2%    | 75,4%  |
| 80–85%    | 1.006     | 82,3%    | 81,7%  |
| 85–90%    | 616       | 87,1%    | 88,6%  |
| 90% e più | 280       | 92,5%    | 93,6%  |

- Le probabilità alte sono ben tarate: il modello non è troppo prudente.
- Sharpening con temperatura (p^a normalizzato): esponente stimato su 2024-25 = 0,987, cioè nessun cambiamento; su 2025-26 (mai vista) il Log Loss resta 0,9926. **Non adottato**: non c'è prudenza da togliere.

## Multiple delle certezze rigiocate (15/11/2026)

Stesso banco, stagioni 2024-26 settimana per settimana: per ogni settimana la giocata più forte di ogni partita (1X2 o doppia chance, dal 75%), dalla più probabile, finché la multipla resta sopra il traguardo (regola della pagina _Certezze_).

| Traguardo  | Multiple | Partite in media | Prevista | Uscite |
| ---------- | -------- | ---------------- | -------- | ------ |
| almeno 70% | 74       | 3,7              | 73,9%    | 82,4%  |
| almeno 50% | 74       | 6,3              | 53,6%    | 66,2%  |

- Le multiple escono più del previsto: le giocate più forti (soprattutto doppie chance oltre il 90%) sono un po' sottostimate e lo scarto si somma. Con 74 multiple il margine è circa ±5 punti: **nessuna correzione**, ma le multiple delle certezze sono prudenti.

## Tiri e xG nel modello gol (15/11/2026)

Comando `stats` (sola lettura, _Actions → Prediction engine → Run workflow_ con `command = stats`): copertura di `match_team_statistics` e backtest settimanale dal 1/7/2024 del Poisson allenato su `(1 − a)·gol + a·attesi` (xG del provider, altrimenti tiri in porta × conversione della competizione calcolata sulle sole partite passate), valutato sui risultati veri.

Prima esecuzione ([run 44](https://github.com/predictra-hq/predictra/actions/runs/43722908436)): **125 partite su 8.716** con statistiche, tutte della competizione 1.

| Modello                    | Log Loss 1X2 (3.442 partite) | Sulle 125 con statistiche |
| -------------------------- | ---------------------------- | ------------------------- |
| Poisson (gol)              | 0,9772                       | 0,9755                    |
| Poisson, attesi 0,3        | 0,9770                       | 0,9749                    |
| Poisson, attesi 0,5        | 0,9769                       | 0,9750                    |
| Poisson, attesi 0,7        | 0,9768                       | 0,9754                    |
| Dixon-Coles + Elo (attivo) | 0,9757                       | 0,9719                    |

- Campione troppo piccolo: **nessuna modifica**. Da rilanciare quando il job `api-football.details` avrà coperto qualche migliaio di partite (circa 44 al giorno).
- **25/11/2026** ([run](https://github.com/predictra-hq/predictra/actions/runs/45601073925)): 475 partite con statistiche su 8.773 (competizioni 1 e 2). Log Loss 1X2 su 3.499 partite dal 1/7/2024: Poisson 0,9776, con attesi 0,3–0,7 0,9775; Dixon-Coles + Elo 0,9763. Sulle 475 con statistiche: Poisson 0,9736, con attesi 0,7 0,9719. Guadagno piccolo e limitato alle partite con statistiche: **nessuna modifica**. Il piano gratuito non dà le statistiche della stagione in corso, quindi per le partite da giocare il guadagno sarebbe ancora minore.

## Under/over e taratura per mercato (15/11/2026)

Banco di prova, Dixon-Coles walk-forward (λ casa, λ ospite, ρ), stima su 2024-25 e verifica su 2025-26 (1.751 partite).

| Mercato  | Frequenza fissa | Dixon-Coles | Binomiale negativa, parametri per linea | Binomiale negativa, parametri comuni |
| -------- | --------------- | ----------- | --------------------------------------- | ------------------------------------ |
| Over 1,5 | 0,5446          | 0,5396      | 0,5376                                  | 0,5391                               |
| Over 2,5 | 0,6913          | 0,6853      | 0,6831                                  | 0,6846                               |
| Over 3,5 | 0,6094          | 0,5983      | 0,5980                                  | 0,5992                               |

- Con parametri diversi per linea il guadagno è in parte adattamento; con parametri comuni (k 1,027, r 59,7) quasi sparisce e l'Over 3,5 peggiora. **Non adottato.**
- Taratura per famiglia di mercato, p′ = σ(a·logit p + b), stimata su 2024-25: doppia chance a 0,984, 1X2 a 0,984, under/over a 0,973 (nessun guadagno sul 2025-26); gol/no gol a 0,707 (Log Loss da 0,6897 a 0,6880: il modello è troppo sicuro, ma queste giocate quasi mai superano il 70%). **Non adottata**: le differenze sulle fasce alte del 2025-26 (under/over 85–90%: 86,9% previsto, 84,0% uscito) non si ripetono sul 2024-25.

## Peso del mercato (15/11/2026)

Comando `market` (sola lettura): partite finite degli ultimi 60 giorni con l'ultima previsione fatta prima del calcio d'inizio (vista `v_pre_kickoff_predictions`, stessa famiglia del modello attivo) e quote 1X2 osservate prima del via, senza margine e mediate tra i bookmaker.

Prima misura ([run 48](https://github.com/predictra-hq/predictra/actions/runs/43728372630)), **19 partite**: modello 0,8136, mercato 0,8072, combinata con peso 0,5 (in uso) 0,8063, con peso 0,6–0,7 0,8057. La combinazione batte modello e mercato da soli; tra 0,5 e 0,7 la differenza è rumore su 19 partite: **peso invariato a 0,5**. Da rilanciare quando le partite saranno qualche centinaio.

**25/11/2026** ([run](https://github.com/predictra-hq/predictra/actions/runs/45601086856)), **75 partite**: modello 0,9694, peso 0,5 0,9555, peso 0,7 0,9523, peso 0,8 0,9512, mercato 0,9500. Ogni peso in più migliora; anche il Brier delle giocate delle schedine (408) dice lo stesso. **Peso portato a 0,75** nelle proposte con valore, nelle schedine consigliate e nel calcolo di Kelly (ADR 0073).

## Combinazione Dixon-Coles + Elo: stacking (16/11/2026)

Banco di prova, stima su 2024-25 e verifica su 2025-26 (1.751 partite). Combinazione attuale (media 0,6/0,4): Log Loss 0,9926; media geometrica con gli stessi pesi 0,9927; stacking (regressione multinomiale sui logaritmi delle due previsioni, pesi per esito) 0,9945 sul 2025-26, pur migliorando la stagione di stima (0,9836 → 0,9821). È adattamento: **non adottato**, la media fissa resta la scelta più solida.

## Modello unico su tutte le competizioni (25/11/2026, ADR 0074)

Comando `cross` (sola lettura, _Actions → Prediction engine → Run workflow_ con `command = cross`): backtest walk-forward settimanale dal 1/7/2024 (3.499 partite) del modello gol con forze **comuni a tutte le competizioni** (`models/joint.py`), da solo e in media con Dixon-Coles + Elo. Per ogni variante: Log Loss e Brier in tutto, per stagione e per competizione, e la differenza dal modello precedente partita per partita con ± 2 errori standard.

| Variante (Log Loss 1X2)        | Tutte (3.499)        | 2024-25 (2.664)      | 2025-26 (835)        | Champions League (351) |
| ------------------------------ | -------------------- | -------------------- | -------------------- | ---------------------- |
| Dixon-Coles + Elo (prima)      | 0,9763               | 0,9818               | 0,9585               | 0,9579                 |
| Modello unico da solo          | 0,9756               | 0,9790               | 0,9647               | 0,9474                 |
| Media, peso unico 0,5          | −0,0021 ± 0,0020     | −0,0031 ± 0,0023     | +0,0010 ± 0,0043     | −0,0135 ± 0,0137       |
| **Media, peso unico 0,3**      | **−0,0017 ± 0,0012** | **−0,0023 ± 0,0014** | **+0,0001 ± 0,0026** | **−0,0100 ± 0,0084**   |
| Media solo in Champions League | −0,0013 ± 0,0014     | −0,0023 ± 0,0016     | +0,0018 ± 0,0026     | −0,0135 ± 0,0137       |

- **Adottato il peso 0,3**: è l'unica variante con un guadagno oltre il caso in tutto e sul 2024-25, senza peggiorare il 2025-26. Il guadagno più grande è in Champions League, dove prima ogni squadra contava solo le sue poche partite europee.
- Il peso è stato scelto tra tre valori provati sulle stesse partite: la scelta automatica (ADR 0023) lo ricontrolla sul backtest del database prima di attivare la versione nuova.
- Il controllo «modello PREDICTRA nuovo» della prova dà gli stessi numeri della media scelta: il codice in produzione è quello misurato.

## Matrice dei risultati riproducibile (26/11/2026, ADR 0078)

Nel modello PREDICTRA λ e ρ salvati con la previsione sono quelli del Dixon-Coles interno; la matrice salvata è la sua, riportata all'1X2 combinato (`rescale_to_1x2`). La spiegazione dell'1X2 lo dice con `matrix_from: "dixon_coles_rescaled_to_1x2"`: per ricostruire la matrice servono λ, ρ e l'1X2 salvati.

## Limiti noti

- Lo storico è solo la stagione in corso: all'inizio il campione è piccolo e il Confidence Score sarà spesso basso.
- Squadre senza partite nella competizione (per esempio all'inizio della Champions League) hanno forza media nel modello per competizione; dal 25/11/2026 il modello unico porta le partite dei campionati nazionali (ADR 0074).
- Elo (K = 20, vantaggio casalingo 60) non è ancora tarato.

### Controllo del 16/11/2026

- `market`: ancora solo 19 partite finite con quote e previsione. LogLoss modello 0,8136, mercato 0,8072, combinata al 50% 0,8063, al 70% 0,8057: differenze sotto il rumore, il peso resta 0,5.
- `stats`: tiri in porta e xG solo su 168 partite (una competizione). Sulle partite con statistiche Dixon-Coles (0,9638) resta meglio di Poisson corretto con gli xG (0,9653): nessun cambio. Da ripetere quando le statistiche coprono più campionati.

### Giorni di riposo (16/11/2026)

Banco di prova, stima su 2024-25 (1.732 partite) e verifica su 2025-26 (1.751). Correzione della previsione attuale con i giorni di riposo calcolati dalle sole partite di campionato (le coppe non sono nei dati del banco):

| Variante                               | Log Loss stima | Log Loss verifica |
| -------------------------------------- | -------------- | ----------------- |
| Previsione attuale                     | 0,9836         | 0,9926            |
| Differenza di riposo casa − ospite     | 0,9831         | 0,9929            |
| Riposo corto (≤ 3 giorni) casa, ospite | 0,9826         | 0,9955            |

Migliora la stagione di stima e peggiora quella mai vista: è adattamento. **Non adottato.** Da riprovare solo con il calendario completo di coppe nazionali ed europee.

### Entrambe segnano: taratura adottata (16/11/2026, ADR 0053)

La prova del 15/11 aveva mostrato che su «entrambe segnano» il modello è troppo sicuro, senza adottare nulla. Ripetuta nei due versi (stima su una stagione, verifica sull'altra) e campionato per campionato, il guadagno si ripete sempre: Log Loss da 0,6870 a 0,6844 sul 2024-25 e da 0,6897 a 0,6870 sul 2025-26. **Adottata** la taratura `σ(0,6 · logit p + 0,05)` solo per questo mercato.

### Under/over 1,5: taratura adottata (16/11/2026, ADR 0053)

Stesso metodo dell'«entrambe segnano», linea per linea: solo sulla linea 1,5 il guadagno si ripete nei due versi (0,5396 → 0,5375 e 0,5234 → 0,5215) e in tutti i campionati. **Adottata** `σ(0,7 · logit p + 0,4)` per l'over 1,5. Linee 2,5 e 3,5: guadagno in un verso solo, **non adottate**.
