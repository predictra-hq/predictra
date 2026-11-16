# Interfaccia: navigazione, app sul telefono, tema e fluidità (M8, corsia B)

Cosa c'è nell'interfaccia oltre alle singole pagine, dove sta nel codice e cosa resta da verificare. **Aggiornato:** 16/11/2026 (pagina Profilo e rifinitura da telefono).

Nessuna di queste funzioni modifica il database: le scelte dell'utente descritte qui restano in cookie del browser.

## Stato

| Funzione                                                   | Stato               | PR  |
| ---------------------------------------------------------- | ------------------- | --- |
| Logo e icona della scheda                                  | in `dev`            | #84 |
| Menu a gruppi, impostazioni in una voce con schede         | in `dev`            | #86 |
| App installabile sul telefono, barra in basso              | in `dev`            | #93 |
| Tema chiaro, barre delle probabilità nel dettaglio partita | in `dev`            | #94 |
| Schedine: puntata consigliata e «L'ho giocata»             | in `dev`            | #95 |
| Campionato preferito                                       | in `dev`            | #96 |
| Avviso di nuova versione                                   | PR aperta, da unire | #97 |
| Fluidità su telefono, transizioni, scheletri per pagina    | PR aperta, da unire | #98 |
| Striscia dell'esito nelle giocate, andamento in Home       | PR aperta, da unire | #99 |

Le sezioni marcate **(PR #97)**, **(PR #98)** e **(PR #99)** descrivono codice non ancora in `dev`: quando le PR vengono unite si toglie la marca e si aggiorna la tabella.

**Nessuna di queste funzioni è stata provata nell'app in esecuzione da chi le ha scritte** (in locale mancava `apps/web/.env.local`): hanno superato `pnpm check` e i test delle parti di logica. La colonna «Da verificare su DEV» in fondo elenca cosa guardare.

## Navigazione

- **Menu laterale** (`components/shell/sidebar.tsx`, voci in `components/shell/nav-config.ts`): gruppi `MAIN_NAV_GROUPS` per ciò che si vuole fare; il gruppo «Dietro le quinte» è richiudibile e resta aperto quando si è su una sua pagina. Gli indirizzi delle pagine non sono cambiati.
- **Profilo** (`app/(app)/settings/page.tsx`): una sola voce nel menu. Mostra chi sei e porta a Bankroll, Giocate fatte, Sicurezza, Preferenze, Campionati, Chiedi a PREDICTRA, Amministrazione (secondo i permessi) e all'uscita. Sicurezza e Preferenze restano due schede (`components/shell/settings-tabs.tsx`) con il ritorno al Profilo. Le icone delle voci stanno in `components/shell/nav-icons.ts`, usabile anche dalle pagine lato server.
- **Barra in basso sul telefono** (`components/shell/bottom-nav.tsx`, voci in `BOTTOM_NAV`): Home, Partite, Certezze, Schedine, Profilo. Compare sotto `lg`; il menu a scomparsa resta per le altre pagine. Con `viewportFit: "cover"` la barra e l'intestazione rispettano le zone dei gesti di iPhone (`env(safe-area-inset-*)`), e il contenuto ha un margine in basso pari alla barra più quella zona.
- **Schede interne** (Schedine, Profilo, Amministrazione): classe `tab-strip` in `globals.css`. Sul telefono stanno su una riga che scorre di lato.
- **Telefono, regole generali** (16/11/2026): campi a 16 px sotto i 640 px (altrimenti iPhone ingrandisce la pagina quando si scrive); descrizione sotto il titolo solo da 640 px in su; griglie sempre con `grid-cols-1` di base; avvertenze in piccolo a fondo pagina invece che in riquadri in cima.
- Chi aggiunge una pagina la inserisce nel gruppo giusto di `MAIN_NAV_GROUPS`; in `BOTTOM_NAV` solo se è una pagina di tutti i giorni (cinque voci sono il massimo leggibile).

## App sul telefono

PREDICTRA si può aggiungere alla schermata Home e aprire a schermo intero. Non c'è un'app negli store e non c'è service worker: **funziona solo online** e non riceve notifiche.

- `app/manifest.ts` genera `/manifest.webmanifest` (nome, colori, `display: standalone`, avvio da `/dashboard`).
- Icone in `apps/web/public/icons/` (192, 512 e 512 con maschera) e `app/apple-icon.png` (180). Sono generate da `app/icon.svg`, lo stesso disegno di `components/shell/logo.tsx`: **se cambia il logo vanno rigenerate tutte**.
- `src/proxy.ts` esclude `manifest.webmanifest` dal controllo della sessione, perché il browser lo scarica senza cookie (vedi [security.md](security.md)).

**Installazione su iPhone:** aprire il sito in Safari e accedere → _Condividi_ → _Aggiungi alla schermata Home_ → lasciare attivo _Apri come app web_ → _Aggiungi_. Alla prima apertura dall'icona può essere richiesto di nuovo l'accesso.

**Installazione su Android (Chrome):** menu ⋮ → _Aggiungi a schermata Home_ (o _Installa app_).

### Avviso di nuova versione (PR #97)

Dopo un deploy, una pagina già aperta continua a usare il codice vecchio; l'app installata può restare aperta per giorni.

- `next.config.ts` fissa `APP_VERSION` alla build da `GITHUB_SHA` (`"local"` fuori dalla CI); `turbo.json` passa `GITHUB_SHA` alla build.
- `GET /api/version` restituisce la versione pubblicata (solo con sessione, `Cache-Control: no-store`).
- `components/shell/update-notice.tsx` la chiede ogni 5 minuti e a ogni ritorno in primo piano; se è diversa mostra «È disponibile una nuova versione» con il pulsante **Aggiorna**, che ricarica la pagina. Non ricarica da solo, per non far perdere un modulo in compilazione.
- L'avviso compare a ogni deploy, anche per modifiche che non toccano l'interfaccia. Se `GITHUB_SHA` non arrivasse alla build, la versione resta `"local"` e l'avviso non compare: nessun errore.

## Tema chiaro e scuro

- I colori sono token in `app/globals.css`: tema scuro in `@theme`, tema chiaro in `:root[data-theme="light"]` con gli stessi nomi. **Chi aggiunge un colore lo definisce in entrambi i blocchi.**
- Si sceglie in _Impostazioni → Preferenze_ (azione `setTheme`). La scelta resta nel cookie `predictra-theme` di quel browser; il layout radice lo legge e imposta `data-theme` su `<html>` e il colore della barra del browser (`lib/theme.ts`).
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

## Fluidità e caricamenti (PR #98)

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
- **Striscia dell'esito** nelle giocate fatte (PR #99): verde vinta, rossa persa, gialla in pari, grigia aperta; esito in `lib/bankroll/outcome.ts`.
- **Andamento in Home** (PR #99): nel riquadro del bankroll, profitto cumulato e percentuale di giocate vinte degli ultimi 90 giorni. Come i totali del riquadro, somma bankroll reali e simulati.

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
| L'avviso di nuova versione compare al deploy successivo a quello della PR #97                | pagina lasciata aperta           |
| Dopo la PR #98: alone di sfondo ancora visibile, scorrimento più fluido, dissolvenza gradita | iPhone                           |
| Striscia dell'esito in tabella e nelle schede su telefono; grafico in Home con poche giocate | Giocate fatte, Home              |
| Audit di accessibilità con tema chiaro e barra in basso                                      | _Verifica DEV_ (`accessibility`) |
