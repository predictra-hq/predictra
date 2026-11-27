# Accessibilità (M8, corsia B1)

Obiettivo: **WCAG 2.1 livello AA** su tutte le pagine dell'app.

> I run di _Verifica DEV_ con `accessibility` e `accessibility-prod` fino al 26/11/2026 sono stati cancellati, perché i loro log e artifact contenevano testo e immagini delle pagine con dati reali, leggibili da chiunque nel repository pubblico ([ADR 0075](../decisions/0075-segreti-e-dati-con-repository-pubblico.md)). I link ai run qui sotto non funzionano più: gli esiti restano quelli scritti.

## Come si verifica

- **Contrasti del tema:** test automatico in `apps/web/src/lib/theme-contrast.test.ts`, eseguito in CI. Legge i colori da `globals.css` e controlla, **per il tema scuro e per il tema chiaro**, tre soglie su `bg`, `surface` e `surface-2`:
  - testo almeno 4.5:1;
  - bordo dei campi almeno 3:1;
  - testo del pulsante principale (`on-positive` su `positive`) almeno 4.5:1.
- **Audit delle pagine:** _Actions → Verifica DEV → Run workflow_ con `check = accessibility`.
  - Il workflow avvia nel runner l'app del branch scelto, collegata a Supabase DEV.
  - Crea un Super Admin temporaneo con 2FA e un bankroll `DEMO`.
  - Esegue [axe-core](https://github.com/dequelabs/axe-core) (regole WCAG 2.1 A e AA) su tutte le pagine, compresi login, 2FA, area admin, dettaglio partita e larghezza mobile.
  - Su ogni pagina raccoglie anche gli errori di funzionamento: eccezioni JavaScript, errori nella console del browser (per esempio violazioni della CSP) e risposte 4xx/5xx dell'app. Una pagina con errori risulta KO. Prima esecuzione con questo controllo: 11/11/2026, 27 controlli su 27 superati ([run 43088334133](https://github.com/gennpalm/predictra/actions/runs/43088334133)).
  - Fa anche controlli da tastiera: il primo Tab raggiunge «Vai al contenuto», il menu mobile si apre e si chiude con Esc.
  - Alla fine cancella sempre l'account. Lo script è `apps/web/scripts/verify-accessibility.mjs`, il riepilogo per pagina compare nel run.
  - Si può avviare anche da un branch di lavoro, prima del merge. Dura circa 5 minuti e non va lanciato a ogni PR, per il budget di minuti di GitHub Actions.

## Esito del 16/11/2026

**53 controlli su 53 superati** ([run](https://github.com/predictra-hq/predictra/actions/runs/43871659347)): tutte le pagine sono verificate anche da telefono (375 px). Su telefono il controllo segnala anche ogni elemento che esce dallo schermo e farebbe scorrere la pagina di lato. Non conta le tabelle larghe che scorrono dentro la loro card. Corretti i difetti trovati dopo le segnalazioni del proprietario:

- le griglie senza colonna base si allargavano quanto il testo più lungo (card della Home fuori schermo): ora hanno sempre `grid-cols-1`;
- le tabelle compatte (Campionati) uscivano dallo schermo e allineavano i nomi a destra: ora sono larghe quanto lo schermo, nascondono le colonne secondarie e, se serve, scorrono dentro la card;
- come rete di sicurezza, l'app taglia ciò che sborda in orizzontale invece di far scorrere la pagina.

## Esito del 15/11/2026

**33 controlli su 33 superati** ([run 25](https://github.com/predictra-hq/predictra/actions/runs/43720105371)): aggiunte la pagina Certezze e le versioni da telefono (375 px) di Certezze, Partite e dettaglio partita, con screenshot nell'artefatto del run (3 giorni; dal 26/11/2026 solo con repository privato, ADR 0075).

## Esito del 9/11/2026

**26 controlli su 26 superati.**

### Correzioni

| Problema                                                                                          | Correzione                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Testo grigio `subtle` (note, didascalie, voci del menu) con contrasto da 3.6 a 4.1:1              | `subtle` da `#6b7280` a `#8e94a0`, ora da 5.7 a 6.5:1                                                               |
| Bordo dei campi dei form quasi invisibile (1.75:1)                                                | Nuovo colore `input` (`#646b79`), da 3.2 a 3.7:1                                                                    |
| Tabelle larghe che scorrono in orizzontale: con la tastiera non si poteva scorrerle               | `Card` con `scrollLabel` e nuovo `ScrollRegion`: regione con nome, raggiungibile con Tab e scorrevole con le frecce |
| 15 tabelle senza titolo per gli screen reader                                                     | `caption` nascosta alla vista                                                                                       |
| Menu mobile chiuso: i link restavano raggiungibili con Tab pur essendo fuori schermo              | Menu chiuso `invisible` sotto `lg`; Esc lo chiude                                                                   |
| Match Center: il nome dei link «risultato» non conteneva il testo visibile (WCAG 2.5.3)           | Testo visibile più descrizione nascosta alla vista, al posto di `aria-label`                                        |
| Statistiche: forma recente (V/N/P) con `aria-label` su uno `span`, che gli screen reader ignorano | Testo nascosto alla vista con l'elenco dei risultati                                                                |

### Già a posto

- `lang="it"`, titolo per ogni pagina, link «Vai al contenuto».
- Tutti i campi con etichetta collegata.
- Focus visibile.
- `prefers-reduced-motion` rispettato.
- Grafici SVG con `role="img"` e descrizione.
- Avvisi dei form in un'area live.

## Aggiunte del 16/11/2026 (rifinitura dell'interfaccia)

Dettagli in [interfaccia.md](interfaccia.md). Per l'accessibilità:

- **Tema chiaro:** stessi token del tema scuro, stesse soglie di contrasto, stesso test.
- **Barra in basso sul telefono:** `nav` con nome proprio («Pagine principali»), voce attiva con `aria-current`.
- **Selettori a pulsante** (tema, campionato preferito): stato con `aria-pressed`, funzionano senza JavaScript perché sono form con Server Action.
- **Barre delle probabilità e striscia dell'esito:** decorative; il dato resta sempre scritto accanto (numero, colonna Stato).
- **Animazioni** (dissolvenza al cambio pagina, voce che pulsa): ridotte a zero con «riduci movimento», come le altre.
- **Avviso di nuova versione:** `role="status"`, pulsante raggiungibile da tastiera.

## Limiti

- axe trova circa un terzo dei problemi WCAG. Restano da provare a mano, con NVDA o VoiceOver, l'ordine di lettura e gli annunci delle Server Action.
- Due pagine non sono state controllate con dati reali:
  - il dettaglio di una proposta del Bet Builder, perché su DEV non c'erano proposte;
  - il Tracker con giocate, perché l'account temporaneo non ne ha.

  Il controllo le include in automatico quando i dati ci sono.

- Le aggiunte del 16/11/2026 non sono ancora passate dall'audit con axe: l'ultimo run (15/11) è precedente. In particolare **il tema chiaro non è mai stato controllato pagina per pagina**: il test dei contrasti copre i token, non ogni combinazione usata nelle pagine. Va rilanciato _Verifica DEV_ con `check = accessibility`, e lo script va esteso per ripetere le pagine con il cookie `predictra-theme=light`.
