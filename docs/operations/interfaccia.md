Cosa c'è nell'interfaccia oltre alle singole pagine, dove sta nel codice e cosa resta da verificare. **Aggiornato:** 16/11/2026 (pagina Profilo e rifinitura da telefono).

Le scelte dell'utente descritte qui restano in cookie del browser, tranne seguiti, data di nascita e stile del nome, che stanno nel database con RLS (sezioni del 17/11/2026).

## Stato

| Funzione                                                   | Stato    | PR  |
| ---------------------------------------------------------- | -------- | --- |
| Logo e icona della scheda                                  | in `dev` | #84 |
| Menu a gruppi, impostazioni in una voce con schede         | in `dev` | #86 |
| App installabile sul telefono, barra in basso              | in `dev` | #93 |
| Tema chiaro, barre delle probabilità nel dettaglio partita | in `dev` | #94 |
| Schedine: puntata consigliata e «L'ho giocata»             | in `dev` | #95 |
| Campionato preferito                                       | in `dev` | #96 |
| Avviso di nuova versione                                   | in `dev` | #97 |
| Fluidità su telefono, transizioni, scheletri per pagina    | in `dev` | #98 |
| Striscia dell'esito nelle giocate, andamento in Home       | in `dev` | #99 |

**Nessuna di queste funzioni è stata provata nell'app in esecuzione da chi le ha scritte** (in locale mancava `apps/web/.env.local`): hanno superato `pnpm check` e i test delle parti di logica. La colonna «Da verificare su DEV» in fondo elenca cosa guardare.

## Navigazione

- **Menu laterale** (`components/shell/sidebar.tsx`, voci in `components/shell/nav-config.ts`): gruppi `MAIN_NAV_GROUPS` per ciò che si vuole fare; il gruppo «Dietro le quinte» è richiudibile e resta aperto quando si è su una sua pagina. Gli indirizzi delle pagine non sono cambiati.
- **Profilo** (`app/(app)/settings/page.tsx`): una sola voce nel menu. Mostra chi sei e porta a Sicurezza, Preferenze, Amministrazione (secondo i permessi) e all'uscita. Sicurezza e Preferenze restano due schede (`components/shell/settings-tabs.tsx`) con il ritorno al Profilo. Le icone delle voci stanno in `components/shell/nav-icons.ts`, usabile anche dalle pagine lato server.
- **Barra in basso sul telefono** (`components/shell/bottom-nav.tsx`, voci in `BOTTOM_NAV`): le stesse sezioni del menu laterale, cioè Home, Pronostici, Calcio, Soldi, più Profilo. Ogni voce apre la prima pagina della sezione e resta accesa su tutte le sue pagine. Le altre pagine della sezione sono schede in alto (`components/shell/section-nav.tsx`, solo sotto `lg`): Home (sola voce, quindi senza schede); Pronostici → Certezze, Schedine, Affidabilità; Calcio → Partite, Campionati (con la scheda interna Squadre), Spogliatoio; Soldi → Bankroll, Giocate fatte, Andamento (dal 23/11/2026, ADR 0065). Profilo raccoglie account e amministrazione. Chi aggiunge una pagina la mette nel gruppo giusto di `MAIN_NAV_GROUPS`: barra e schede si aggiornano da sole. Con `viewportFit: "cover"` barra e intestazione rispettano le zone dei gesti di iPhone (`env(safe-area-inset-*)`).
- **Schede interne** (Schedine, Profilo, Amministrazione): classe `tab-strip` in `globals.css`. Sul telefono stanno su una riga che scorre di lato.
- **Tabelle sul telefono** (`globals.css`): dentro `Card scrollLabel` e `ScrollRegion` ogni riga diventa una scheda a due colonne (etichetta sopra, valore sotto). `compact-sm` le lascia tabelle vere con le colonne `sm-secondary` nascoste (classifiche: l'intestazione deve avere le stesse classi delle celle). `limit-sm` mostra solo le prime 8 righe e una nota (`data-more`), per gli elenchi lunghi dell'amministrazione.
- **Telefono, regole generali** (16/11/2026): campi a 16 px sotto i 640 px (altrimenti iPhone ingrandisce la pagina quando si scrive); descrizione sotto il titolo solo da 640 px in su; griglie sempre con `grid-cols-1` di base; avvertenze in piccolo a fondo pagina invece che in riquadri in cima.

## App sul telefono

PREDICTRA si può aggiungere alla schermata Home e aprire a schermo intero. Non c'è un'app negli store: **funziona solo online** e non riceve notifiche. Un service worker minimo mostra la schermata «Sei offline» quando manca la rete, senza conservare dati ([ADR 0059](../decisions/0059-schermata-offline.md)).

- `app/manifest.ts` genera `/manifest.webmanifest` (nome, colori, `display: standalone`, avvio da `/dashboard`).
- Icone in `apps/web/public/icons/` (192, 512 e 512 con maschera) e `app/apple-icon.png` (180). Sono generate da `app/icon.svg`, lo stesso disegno di `components/shell/logo.tsx`: **se cambia il logo vanno rigenerate tutte**.
- `src/proxy.ts` esclude `manifest.webmanifest` dal controllo della sessione, perché il browser lo scarica senza cookie (vedi [security.md](security.md)).

**Installazione su iPhone:** aprire il sito in Safari e accedere → _Condividi_ → _Aggiungi alla schermata Home_ → lasciare attivo _Apri come app web_ → _Aggiungi_. Alla prima apertura dall'icona può essere richiesto di nuovo l'accesso.

**Installazione su Android (Chrome):** menu ⋮ → _Aggiungi a schermata Home_ (o _Installa app_).

### Avviso di nuova versione

Dopo un deploy, una pagina già aperta continua a usare il codice vecchio; l'app installata può restare aperta per giorni.

- `next.config.ts` fissa `APP_VERSION` alla build da `GITHUB_SHA` (`"local"` fuori dalla CI); `turbo.json` passa `GITHUB_SHA` alla build.
- `GET /api/version` restituisce la versione pubblicata (solo con sessione, `Cache-Control: no-store`).
- `components/shell/update-notice.tsx` la chiede ogni 5 minuti e a ogni ritorno in primo piano; se è diversa mostra «È disponibile una nuova versione» con il pulsante **Aggiorna**, che ricarica la pagina. Non ricarica da solo, per non far perdere un modulo in compilazione.
- L'avviso compare a ogni deploy, anche per modifiche che non toccano l'interfaccia. Se `GITHUB_SHA` non arrivasse alla build, la versione resta `"local"` e l'avviso non compare: nessun errore.

## Tema chiaro e scuro

- I colori sono token in `app/globals.css`: tema scuro in `@theme`, tema chiaro in `:root[data-theme="light"]` con gli stessi nomi. **Chi aggiunge un colore lo definisce in entrambi i blocchi.**
- Si sceglie in _Impostazioni → Preferenze_ (`components/shell/theme-picker.tsx`). Dal 17/11/2026 il cambio avviene **solo nel browser**: cambia `data-theme` su `<html>`, il colore della barra e scrive il cookie `predictra-theme`, senza chiamare il server. Prima un'azione del server ricaricava tutta l'interfaccia e ne ripeteva le letture. Al caricamento successivo il layout radice legge il cookie e disegna già il tema giusto (`lib/theme.ts`).
- `on-positive` è il colore del testo sopra `bg-positive` (pulsante principale): usare `text-on-positive`, non `text-black`. `veil` è il velo di intestazioni e righe evidenziate delle tabelle.
- I contrasti di entrambi i temi sono verificati dallo stesso test (vedi [accessibilita.md](accessibilita.md)).

## Schedine: dalla proposta alla giocata

- **Simulazione della puntata** (`StakeSimulation` in `components/bet-builder/shared.tsx`, calcolo in `lib/bet-builder/format.ts`): campo «Quanto vuoi giocare» (parametro `s`); mostra incasso e perdita con le rispettive probabilità. È aritmetica su quota e probabilità già calcolate: nessuna stima nuova.
- **Puntata consigliata** (`lib/bet-builder/register.ts`): su ogni schedina consigliata, la puntata Kelly sul bankroll dell'utente con le regole dell'[ADR 0031](../decisions/0031-staking.md) (`suggestStake`: un quarto di Kelly, tetto 2%, stake massimo dei limiti personali). Bankroll di riferimento: il primo reale, altrimenti il primo. Se la schedina non ha valore lo dice e non consiglia nulla; senza bankroll la riga non compare.
- **«L'ho giocata»:** apre `/tracker?add=1&…` già compilato (stessi parametri del link «Registra» delle Certezze, più `st` per la puntata). La schedina è una sola giocata multipla. **Non salva nulla da sola e PREDICTRA non piazza scommesse:** l'utente controlla e conferma.
- I dati del bankroll si leggono con la sessione dell'utente (RLS): nessun amministratore li vede.

## Campionato preferito

Stella sotto il filtro di _Partite_: il campionato scelto è quello che Partite e Campionati aprono quando l'indirizzo non ne indica uno. Cookie `predictra-campionato`, impostato dall'azione `setFavoriteCompetition`; ordine di scelta in `chooseCompetition` (`lib/football/favorite.ts`).

**Limite voluto:** vale per il browser in uso e solo per il campionato. Per averlo su tutti i dispositivi, o per le squadre preferite, serve una colonna o tabella nuova: è una modifica al contratto, da fare con una PR dedicata.

## Fluidità e caricamenti

Server e database non sono la causa della poca reattività segnalata sul telefono (stessa regione, pagina di accesso in circa 0,17 s il 16/11/2026). Gli interventi sono sul disegno della pagina e sul riscontro al tocco:

- **Sfondo:** l'alone sta su `body::before` con `position: fixed`, non su `background-attachment: fixed`, che su iOS fa ridisegnare la pagina a ogni scorrimento. Il colore di fondo è su `html`.
- **Barre su telefono** a sfondo pieno, senza `backdrop-blur`.
- **Tocco:** stati `active`, voce toccata che pulsa finché la pagina non arriva (`useLinkStatus`), `touch-action: manipulation`.
- **Cambio pagina:** `app/(app)/template.tsx` applica `.page-enter` (dissolvenza di 180 ms; con «riduci movimento» è di fatto assente).
- **Scheletri per pagina:** `loading.tsx` nelle sezioni, con `ListSkeleton` e `CardsSkeleton` di `components/ui/skeletons.tsx`. Il `loading.tsx` di una sezione vale anche per le sue sottopagine.
- **Aggiorna i dati:** pulsante nella barra in alto su telefono (`router.refresh()`), perché nell'app installata manca il pulsante di ricarica del browser.

**Non fatto, da decidere:** ogni cambio pagina rilegge tutto dal database, anche previsioni e quote che cambiano due volte al giorno. Tenerle in memoria per qualche minuto è il guadagno maggiore, ma modifica l'[ADR 0006](../decisions/0006-next-senza-cache-components.md) e spetta al proprietario.

## Altri elementi grafici

- **Barre delle probabilità** nel pannello previsioni del dettaglio partita (`components/predictions/match-predictions.tsx`): decorative, il numero resta accanto.
- **Striscia dell'esito** nelle giocate fatte: verde vinta, rossa persa, gialla in pari, grigia aperta; esito in `lib/bankroll/outcome.ts`.
- **Andamento in Home**: nel riquadro del bankroll, profitto cumulato e percentuale di giocate vinte degli ultimi 90 giorni. Come i totali del riquadro, somma bankroll reali e simulati.

## Ampliamenti del 17/11/2026

| Funzione                                                  | Stato               | PR         |
| --------------------------------------------------------- | ------------------- | ---------- |
| Pagina squadra e ricerca delle squadre                    | in `dev`            | #103       |
| Risultati esatti più probabili e movimento delle quote    | in `dev`            | #104       |
| Pagina Affidabilità                                       | in `dev`            | #105       |
| Squadre e campionati seguiti (contratto, poi interfaccia) | in `dev`            | #106, #107 |
| Notifiche sul telefono                                    | proposta, non fatta | ADR 0054   |

- **Pagina squadra** (`app/(app)/teams/[id]/page.tsx`): forma delle ultime 5, prossime partite, ultimi risultati, numeri delle stagioni in corso. Si apre toccando il nome di una squadra nel dettaglio partita, in classifica e nelle statistiche. Logica in `lib/football/team.ts`.
- **Ricerca** (`/teams`, voce «Squadre» nel gruppo Calcio): per nome, almeno due lettere. `containsPattern` neutralizza i caratteri jolly di Postgres e i separatori dei filtri.
- **Risultati più probabili** nel pannello previsioni: i cinque risultati esatti più probabili tra quelli già pubblicati dal motore (`topScores` in `lib/predictions/format.ts`). Nessun calcolo nuovo.
- **Movimento delle quote** (`components/odds/odds-movement.tsx`, calcolo in `lib/odds/movement.ts`): 1X2, media dei bookmaker raccolti, dalla prima quota raccolta all'ultima. «Prima» non è l'apertura del bookmaker ma la prima raccolta di PREDICTRA. Compare solo se ci sono almeno due rilevamenti.
- **Affidabilità** (`/reliability`, gruppo Pronostici): delle giocate date almeno al 70% prima della partita, quante sono uscite negli ultimi 60 giorni, per tipo di giocata e per campionato. Stesse regole della verifica delle Certezze (`lib/certainties/reliability.ts`); sotto le 20 giocate si mostra solo il conteggio.
- **Seguiti** (`user_follows`, [identity.md](../data-dictionary/identity.md)): pulsante «Segui» sulla squadra, elenco nella pagina Squadre, prossime partite in Home. La stella del campionato preferito registra anche il campionato tra i seguiti: senza cookie, su un altro dispositivo, si parte da quello. Scritture con la sessione dell'utente; al più 50 seguiti.

**Non provato nell'app in esecuzione** da chi l'ha scritto. Da guardare su DEV:

- pagina squadra con una squadra che gioca in due competizioni (campionato e coppa);
- movimento delle quote su una partita con molte raccolte: tempo di caricamento del dettaglio;
- Affidabilità: i numeri devono coincidere con la verifica per fascia delle Certezze;
- Segui / smetti di seguire, e il riquadro in Home;
- la barra in basso e le schede di sezione con le voci nuove (Squadre, Affidabilità) su telefono.

## Presentazione, tutorial, comunità (17/11/2026, sera)

| Funzione                                              | Stato    | PR   |
| ----------------------------------------------------- | -------- | ---- |
| Tema applicato nel browser, senza chiamate al server  | in `dev` | #114 |
| Chiedi a PREDICTRA in un pannello, non più nel menu   | in `dev` | #115 |
| Tutorial interattivo (contiene il pannello di Chiedi) | in `dev` | #116 |
| Avatar predefinito con il logo (stile A)              | in `dev` | #117 |
| Schermata «Sei offline»                               | in `dev` | #118 |
| Presentazione prima del login                         | in `dev` | #119 |
| Contratto della comunità                              | in `dev` | #120 |
| Compleanno, stile del nome, commenti (interfaccia)    | in `dev` | #121 |

- **Tema** (`components/shell/theme-picker.tsx`): vedi «Tema chiaro e scuro». Nessuna chiamata al server quando si cambia.
- **Chiedi a PREDICTRA** (`components/ask/ask-launcher.tsx`): pulsante tondo in basso a destra, sopra la barra sul telefono. Apre la chat in un pannello (dal basso sul telefono, al centro su schermi larghi); la conversazione resta finché non si ricarica la pagina. Il pannello ha il collegamento alla pagina intera `/ask`, dove il pulsante non compare. La voce è uscita dal menu.
- **Tutorial** (`components/shell/tour.tsx`, passi in `lib/tour.ts`): sette passi alla prima entrata (benvenuto, Home, Pronostici, Calcio, Soldi, Chiedi, Profilo). Evidenzia il primo elemento visibile del passo (barra in basso sul telefono, menu laterale su schermi larghi); se non c'è, la scheda sta al centro. Esc o «Salta» lo chiudono; il cookie `predictra-tour=done` lo ricorda in quel browser; «Rivedi il tutorial» nel Profilo lo riapre.
- **Avatar** (`components/ui/user-avatar.tsx`, colore in `lib/profile/avatar.ts`): simbolo di PREDICTRA in bianco su un cerchio colorato; il colore viene dall'id dell'utente (6 colori, contrasto ≥ 3:1 con il bianco). Nel menu laterale, nel Profilo e nell'elenco utenti dell'amministrazione. Nessun dato salvato.
- **Sei offline** (`public/sw.js`, `app/offline/route.ts`): [ADR 0059](../decisions/0059-schermata-offline.md).
- **Presentazione** (`app/page.tsx`): chi non ha una sessione e apre `/` vede la presentazione; chi è dentro va in Home. Impaginazione a F: riga in alto con nome e «Accedi», titolo e frase, poi le funzioni in colonna a sinistra, infine «Cosa PREDICTRA non fa». Il «video» (`components/landing/demo-video.tsx`) sono quattro scene animate scritte nel codice, con pausa e scelta della scena, **solo dati di esempio etichettati DEMO**: nessun file video e nessun servizio a pagamento. Con «riduci movimento» attivo non scorre da solo. Le altre pagine senza sessione continuano a portare al login, che ha il collegamento «Cos'è PREDICTRA».
- **Comunità** ([ADR 0058](../decisions/0058-comunita-commenti-e-maggiore-eta.md)): in _Preferenze_ data di nascita (la vede solo l'utente) e stile del nome; commenti in fondo al dettaglio partita per chi ha dichiarato almeno 18 anni; in Home chi compie gli anni oggi, se lo ha permesso. Colori del nome: token `name-*` in `globals.css`, verificati dal test dei contrasti.

**Non provato nell'app in esecuzione** da chi l'ha scritto. Da guardare su DEV:

- cambio di tema: nessuna richiesta al server nella scheda _Rete_ del browser, nessun lampo al ricaricamento;
- pannello di Chiedi su telefono: non copre la barra, la tastiera non nasconde il campo;
- tutorial su telefono e su computer, anche con il menu laterale chiuso;
- schermata offline: app installata, modalità aereo, aprire una pagina;
- presentazione da non collegati, su telefono e con il tema chiaro;
- commenti con due utenti (uno senza data di nascita), cancellazione e moderazione da amministratore.

## Scelte escluse

- **Stemmi delle squadre:** non aggiunti. La documentazione delle fonti non copre l'uso delle immagini e API-Football dichiara di non dare licenza di pubblicazione ([api-football.md](../data-sources/api-football.md)); gli stemmi sono marchi dei club. Si riapre solo con una licenza verificata.
- **Avviso nel menu per nuove schedine:** le schedine si calcolano al momento dalle quote, non c'è un evento a cui agganciarlo senza una lettura in più a ogni pagina o uno stato salvato.
- **«Tira giù per aggiornare»:** sostituito dal pulsante _Aggiorna i dati_, perché il gesto non si poteva provare su un telefono e rischiava di interferire con lo scorrimento.

## Da verificare su DEV

| Cosa                                                                                         | Dove                             |
| -------------------------------------------------------------------------------------------- | -------------------------------- |
| Icona, nome e apertura a schermo intero dell'app installata                                  | iPhone e Android                 |
| La barra in basso non copre contenuti o pulsanti a fondo pagina                              | telefono, tutte le pagine        |
| Tema chiaro pagina per pagina: ombre, grafici, alone di sfondo                               | Preferenze → Chiaro              |
| Puntata consigliata e «L'ho giocata» con schedine e bankroll reali                           | Schedine → Giocate fatte         |
| L'avviso di nuova versione compare al deploy successivo, sopra la barra in basso             | pagina lasciata aperta           |
| Alone di sfondo ancora visibile, scorrimento più fluido, dissolvenza gradita                 | iPhone                           |
| Striscia dell'esito in tabella e nelle schede su telefono; grafico in Home con poche giocate | Giocate fatte, Home              |
| Audit di accessibilità con tema chiaro e barra in basso                                      | _Verifica DEV_ (`accessibility`) |

## Gestionale: funzioni del 16/11/2026

| Funzione                                                                                                 | Dove                                  | Codice                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Sito del bankroll, quote di quel sito, quota modificabile in «L'ho giocata»                              | Bankroll, Schedine, Certezze          | ADR 0051, `components/bet-builder/stake-box.tsx`                           |
| Confronto quote: «Altrove paga di più» accanto alla quota del proprio sito                               | Schedine, Certezze, dettaglio partita | `bestItalianPrices` in `lib/bet-builder/likely.ts`                         |
| Chiusura automatica delle giocate a partite finite                                                       | Giocate fatte, Bankroll, Home         | ADR 0030 (aggiornamento), `lib/bankroll/legs.ts`, `lib/bankroll/settle.ts` |
| «Come sto andando»: per mese, tipo di giocata e sito                                                     | Giocate fatte                         | `lib/bankroll/breakdown.ts`                                                |
| «Da non perdere»: giocate sopra soglia entro 36 ore, schedina con valore, giocate aperte e appena chiuse | Home; soglia in Preferenze (cookie)   | `lib/alerts.ts`, `AlertsCard` in `components/dashboard/cards.tsx`          |

Non verificato con dati reali da chi le ha scritte: le quote del proprio sito e il confronto (l'utente di prova non ha un sito collegato e le quote erano ferme per la sosta), la chiusura automatica su una giocata vera, il riquadro «Da non perdere» con partite entro 36 ore. La logica di ognuna è coperta da test.

## 17/11/2026: tabelle, finestre e pagine più semplici

- **Tabelle con limite.** Ogni tabella che può crescere mostra le prime 10 righe (5 nelle risposte di Chiedi a PREDICTRA) e il bottone «Mostra altre N» (`components/ui/limited.tsx`, `row-limit.tsx`). Sostituisce il vecchio limite solo da telefono (`limit-sm`). Classifiche e tabelle a righe fisse restano intere.
- **Finestre modali.** Le azioni su Utenti (cambio ruolo, sospendi, riattiva, link per la password) e la revoca degli inviti si confermano in una finestra (`ActionDialog`, `<dialog>` nativo). Esito e link monouso compaiono nella finestra, non allungano la card. `ActionForm` accetta `resultDialog` per mostrare l'esito in una finestra (creazione inviti).
- **Dettagli tecnici solo per chi amministra** (permesso `agents.monitor`): provenienza e qualità della partita, modello e versione delle schedine, fonte e qualità della classifica. Gli altri vedono solo «aggiornato al …». L'attribuzione richiesta dalle licenze delle fonti resta per tutti.
- **Home.** Prossime partite con le probabilità 1X2, grafico settimanale «Come ci ha preso il modello» (giocate dall'80%, ultime 6 settimane) e «Campionati a confronto» (gol medi, più di 2,5 gol, gol di entrambe).
- **Certezze** divise per campionato; in **Campionati** il clic su una competizione scende al campionato aperto.

## 17/11/2026: indirizzi in inglese e nomi delle pagine in Chiedi a PREDICTRA

- Tutti gli indirizzi delle pagine sono in inglese. `/certezze` è diventato `/certainties` e `/affidabilita` è diventato `/reliability`; i vecchi indirizzi reindirizzano ai nuovi (`next.config.ts`, redirect permanente), così i link salvati continuano a funzionare. La Verifica DEV lo controlla.
- I nomi mostrati restano in italiano. Chiedi a PREDICTRA indica le pagine solo con i nomi del menu (es. «Pronostici › Schedine › Costruisci»), presi dalla guida `guida_app`, mai con nomi interni come «Bet Builder».

## Versione dell'app (17/11/2026)

Il sito mostra un numero di versione, **v1.0.0** al 17/11/2026, e non più il commit. Compare in fondo al Profilo, sotto «Esci» nel menu laterale e in fondo alla presentazione.

- Il numero sta nel campo `version` di `apps/web/package.json`. `next.config.ts` lo fissa alla build (`APP_RELEASE`); `formatRelease()` in `lib/version.ts` aggiunge la «v» e mostra `v0.0.0` se il valore non è valido.
- Il commit (`APP_VERSION`, da `GITHUB_SHA`) resta solo per l'avviso «nuova versione disponibile» e non si mostra.
- **Come si aggiorna:** dal 23/11/2026 in automatico, a ogni deploy e per ambiente (ADR 0066). Nessuno tocca più il numero a mano.
  - **PROD** (merge su `main`): la cifra di mezzo sale di uno a ogni merge e l'ultima è 0: `1.4.0` → `1.5.0` → `1.6.0`.
  - **DEV** (push su `dev`): stessa cifra di mezzo di PROD; l'ultima conta i commit di `dev` non ancora in produzione: `1.4.1`, `1.4.2`… Dopo il merge su `main` riparte: `1.5.0`, poi `1.5.1`.
  - Il calcolo è in `scripts/release/version.sh` e parte da `apps/web/release.json`: una versione di PROD e il merge di `main` a cui corrisponde. Il deploy (`deploy-target.yml`) passa il numero alla build come `APP_RELEASE` e lo scrive nel riepilogo del run.
  - La prima cifra (`2.0.0`) sale solo per un cambiamento grande, deciso dal proprietario: si aggiorna `release.json` con la nuova base.
  - In locale il sito mostra il `version` di `apps/web/package.json`.
- Storia: fino al 23/11/2026 il numero si alzava a mano in `package.json` (1.1.0–1.4.0). Il 23/11/2026 PROD era alla 1.4.0, base del calcolo automatico.

## 18/11/2026: Profilo più chiaro, immagine del profilo per tipo

Versione **1.3.0**. Pensato per chi non ha sviluppato l'app: ogni voce dice cosa cambia e mostra il valore attuale.

- **Profilo** (`app/(app)/settings/page.tsx`): in alto immagine, nome con il suo stile, email e ruolo, con «Modifica profilo». Sotto, voci divise per tipo:
  - _Il tuo profilo:_ Nome utente, Immagine del profilo, Stile del nome, Data di nascita (con lo stato dei commenti);
  - _Accesso e sicurezza:_ Verifica in due passaggi, Password, Dispositivi;
  - _App e aiuto:_ Tema, Suoni, Avvisi in Home, Lingua e orario, Chiedi a PREDICTRA, Rivedi il tutorial;
  - _Amministrazione_, per chi ne ha i permessi.

  Righe compatte: etichetta breve a sinistra e valore attuale a destra sulla stessa riga, icone piccole; i riquadri di _Il tuo profilo_ e _Preferenze dell'app_ hanno titoli e spiegazioni più brevi. Ogni voce porta direttamente al riquadro giusto, tramite le ancore `#name`, `#avatar`, `#name-style`, `#birthday`, `#mfa`, `#password`, `#sessions`, `#theme`, `#sounds`, `#alerts` e `#region`.

- **Il tuo profilo** (`/settings/account`, pagina nuova): nome utente, immagine, stile del nome, data di nascita. Il nome ha ora un modulo suo (`saveDisplayName`), separato da lingua e fuso orario.
- **Preferenze dell'app** (`/settings/preferences`): solo tema, suoni, avvisi, lingua e fuso orario.
- Schede in alto: Profilo ‹, Il tuo profilo, Sicurezza, Preferenze dell'app.
- **Immagine del profilo per tipo** (`components/ui/user-avatar.tsx`, migrazione `20261118120000_avatar_style.sql`): sempre nel verde del sito, con i colori del tema, quindi corretta in chiaro e in scuro. Cinque tipi: Classica (predefinita), Contorno, Pallone, Andamento, Iniziale. Nella scelta ci sono solo le immagini, senza scritte sotto; il nome del tipo è nel suggerimento e per i lettori di schermo. I colori scelti prima (`avatar_color`) tornano alla Classica.
- **Data di nascita:** senza una data salvata il calendario parte da oggi.
- **Suoni accesi di base:** spenti solo se si sceglie «Spenti» (cookie `predictra-sounds=off`).
- **Pulsante di Chiedi a PREDICTRA:** verde pieno a riposo, più scuro al passaggio e quando si tocca (prima era trasparente e si colorava solo al passaggio).

**Non provato nell'app in esecuzione:** le pagine richiedono l'accesso. Da guardare su DEV, su telefono: Profilo, le voci che aprono il riquadro giusto, la scelta dell'immagine.

## 18/11/2026: suoni, Discussioni, avatar a scelta, barra fissa

Tutto nella stessa PR (versione **1.1.0**).

- **Suoni** (`lib/sounds.ts`, interruttore `components/shell/sound-toggle.tsx` in _Preferenze_): toni brevi generati con la Web Audio API, nessun file. Salita quando un modulo va a buon fine, discesa per un errore, due note all'arrivo di una risposta di Chiedi a PREDICTRA, un tocco per tema, «Aggiorna» e passi del tutorial, quattro note alla fine del tutorial. **Spenti per default** (accesi di base dal 18/11/2026, vedi «Profilo più chiaro»), valgono per il dispositivo (cookie `predictra-sounds`). Il messaggio scritto c'è sempre.
- **Discussioni** (`/discussions`, gruppo Calcio): gli ultimi 50 commenti di tutte le partite, con il collegamento al riquadro Commenti della partita (`#comments`). Prima i commenti stavano solo in fondo a ogni partita e lo sblocco con la data di nascita non si vedeva. Senza una data di almeno 18 anni fa la pagina spiega come sbloccarla. In _Preferenze_, sotto la data di nascita, un riquadro dice se commenti e Discussioni sono sbloccati.
- **Avatar a scelta** (_Preferenze → Avatar_): sei colori o «Automatico» (`profiles.avatar_color`). Sostituito lo stesso giorno dal tipo di immagine nel verde del sito: vedi la sezione «Profilo più chiaro».
- **Nome con stile nel menu laterale e nel Profilo**: colore e scritta scelti in _Preferenze_ compaiono anche lì, non solo nei commenti. Salvando si aggiorna tutto il layout.
- **Tutorial una sola volta per utente**: «già visto» sta nel profilo (`user_dashboard_settings.settings.tour_done`), quindi non ricompare dopo un nuovo accesso, nell'app installata (che ha cookie separati da Safari) o su un altro dispositivo. Il cookie resta per non leggere il database a ogni pagina.
- **Barra in alto fissa sul telefono**: era `sticky` e seguiva il rimbalzo quando si tira giù la pagina, mentre il pulsante di Chiedi (fisso) restava fermo. Ora è `fixed` con uno spazio riservato sotto; niente rimbalzo anche su `html` (iPhone).
- **Icona di Chiedi a PREDICTRA**: `BotMessageSquare` (un fumetto con un assistente) al posto del punto di domanda, nel pulsante, nel menu e nella presentazione.

**Non provato nell'app in esecuzione.** Da guardare su DEV: suoni su iPhone (prima il tocco su «Accesi»), barra fissa tirando giù la pagina, tutorial dopo uscita e nuovo accesso, Discussioni con un utente senza data di nascita.

## 18/11/2026: presentazione riscritta per chi non conosce PREDICTRA

Versione **1.2.0**. La presentazione (`app/page.tsx`, testi in `it.ts` → `landing`) risponde, nell'ordine dello schema a F, alle domande di chi arriva:

| Sezione                         | Domanda o dubbio a cui risponde                          |
| ------------------------------- | -------------------------------------------------------- |
| Titolo e tre punti in evidenza  | A cosa serve? È affidabile? Mi chiede soldi o scommesse? |
| A cosa ti serve (tre casi)      | «Non vedo qualcosa che possa interessarmi»               |
| Come funziona (tre passi)       | È facile?                                                |
| Perché fidarsi dei numeri       | «Il solito sistema fake?»                                |
| È sicuro?                       | Chi vede i miei dati, come si entra, pagamenti           |
| Domande che ci si fa all'inizio | Fake, costi, cosa offre, se serve a chi gioca poco       |

- Barra in alto fissa con «Come funziona», «Sicurezza», «Domande» (su computer) e «Accedi».
- **Il video non cambia più dimensione:** le quattro scene stanno una sopra l'altra nella stessa cella e si vede solo quella attiva, quindi il riquadro ha sempre l'altezza della più alta. Prima ogni scena aveva la sua altezza e spostava tutta la pagina. Verificato in anteprima locale: altezza identica nelle quattro scene, su computer e su telefono.
- Nessuna promessa di vincita e nessun numero reale: le scene restano con dati `DEMO`. Sul costo la pagina dice solo ciò che è vero oggi: dentro PREDICTRA non si compra nulla e l'accesso è su invito.
- In fondo l'avvertenza sul gioco: vietato ai minori di 18 anni, il gioco può causare dipendenza.

## 23/11/2026: Spogliatoio, profilo pubblico, Costruisci più chiaro

- **Spogliatoio** (`/community`, gruppo Home, ADR 0064; sul telefono è una scheda di Home e in Home c'è una card con gli ultimi messaggi): chat Generale, Schedine e Partite. La vecchia `/discussions` reindirizza alla chat Partite. Ogni messaggio mostra immagine, nome e stile di chi scrive.
- **Condividi** nelle schedine consigliate, nelle Passate e nella Valutazione di Costruisci: nella chat Schedine oppure in altre app (condivisione del telefono, altrimenti copia del testo).
- **Niente data di nascita**: tolti il riquadro, il compleanno in Home e lo sblocco dei commenti. Scrivono tutti gli iscritti attivi.
- **Immagine del profilo come il logo**: stesso quadrato, stessa linea e stesso pallone, in cinque versioni.
- **Profilo**: una voce per pagina (Il tuo profilo, Accesso e sicurezza, Preferenze). Il tuo profilo mostra in alto come ti vedono gli altri.
- **Costruisci**: sul computer niente barra in basso, la Valutazione a destra si aggiorna da sola. Ogni giocata ha l'esito in grassetto, sotto partita e data, e una × per toglierla; «Togli tutte» svuota la schedina. Sul telefono la barra resta, sopra la navigazione.

## 23/11/2026: versione 1.4.0, schedine come biglietti, Spogliatoio sotto Calcio

Versione **1.4.0** (passaggio in produzione). ADR 0065.

- **Schedine disegnate come biglietti** (`components/bet-builder/ticket.tsx`): intestazione con il simbolo e «PREDICTRA · Schedina», una riga per partita (orario, partita, esito in evidenza, quota), uno strappo tratteggiato con due tacche, poi la quota totale in grande. Le usano le schedine consigliate, le Passate e le proposte con valore.
- **Proposte con valore**: al massimo 2 per categoria e turno (erano 8), selezioni dal 35% e combinazioni dal 15%. Regole `2026.11.23-1` nel motore e in `@predictra/shared-types`.
- **Schedine consigliate più precise**: probabilità corretta con la verifica storica del mercato e della fascia, modello e mercato d'accordo entro 10 punti, prima la precisione e poi il valore, niente più schedina a 6 partite.
- **Spogliatoio** all'indirizzo `/locker-room` (traduzione di spogliatoio), nel gruppo Calcio: sul telefono è una scheda di Calcio, accanto a Partite e Campionati. `/community` e `/discussions` reindirizzano.
- **Campionati e Squadre** in una sezione: Squadre è una scheda interna di Campionati (`components/football/leagues-nav.tsx`) e non è più una voce del menu. L'indirizzo `/teams` non cambia.

**Non provato nell'app in esecuzione.** Da guardare su DEV, anche da telefono: biglietti delle schedine (tacche dello strappo su sfondo chiaro e scuro), schede di Calcio con lo Spogliatoio, schede Classifiche/Squadre.

## 23/11/2026, sera: versione 1.4.1

- **Spogliatoio come una chat** (`components/community/chat.tsx`, `chat-composer.tsx`): bolle, ultimo messaggio in basso (`flex-col-reverse`, la chat si apre già in fondo senza codice nel browser), campo per scrivere fisso sotto. Schedine condivise come biglietti.
- **Home:** la card dello Spogliatoio mostra al massimo tre messaggi su una riga ciascuno, senza la scritta «Entra»: basta la freccia.
- **Certezze:** riquadri più piccoli, al massimo 4 per riga (da 1536 px). **Schedine** (consigliate, Passate, proposte, multiple più probabili, salvate): al massimo 4 per riga, campionato accanto all'orario.
- **Partite:** colonna «Giocata più probabile», in grigio sotto il 70%. **Data Center:** spiegazione di ogni controllo di qualità.

**Non provato nell'app in esecuzione.** Da guardare su DEV: altezza della chat su telefono con la tastiera aperta, invio con Invio su computer.
