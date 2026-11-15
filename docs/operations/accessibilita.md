# Accessibilità (M8, corsia B1)

Obiettivo: **WCAG 2.1 livello AA** su tutte le pagine dell'app.

## Come si verifica

- **Contrasti del tema:** test automatico in `apps/web/src/lib/theme-contrast.test.ts`, eseguito in CI. Legge i colori da `globals.css` e controlla due soglie su `bg`, `surface` e `surface-2`:
  - testo almeno 4.5:1;
  - bordo dei campi almeno 3:1.
- **Audit delle pagine:** _Actions → Verifica DEV → Run workflow_ con `check = accessibility`.
  - Il workflow avvia nel runner l'app del branch scelto, collegata a Supabase DEV.
  - Crea un Super Admin temporaneo con 2FA e un bankroll `DEMO`.
  - Esegue [axe-core](https://github.com/dequelabs/axe-core) (regole WCAG 2.1 A e AA) su tutte le pagine, compresi login, 2FA, area admin, dettaglio partita e larghezza mobile.
  - Su ogni pagina raccoglie anche gli errori di funzionamento: eccezioni JavaScript, errori nella console del browser (per esempio violazioni della CSP) e risposte 4xx/5xx dell'app. Una pagina con errori risulta KO. Prima esecuzione con questo controllo: 11/11/2026, 27 controlli su 27 superati ([run 43088334133](https://github.com/gennpalm/predictra/actions/runs/43088334133)).
  - Fa anche controlli da tastiera: il primo Tab raggiunge «Vai al contenuto», il menu mobile si apre e si chiude con Esc.
  - Alla fine cancella sempre l'account. Lo script è `apps/web/scripts/verify-accessibility.mjs`, il riepilogo per pagina compare nel run.
  - Si può avviare anche da un branch di lavoro, prima del merge. Dura circa 5 minuti e non va lanciato a ogni PR, per il budget di minuti di GitHub Actions.

## Esito del 15/11/2026

**33 controlli su 33 superati** ([run 25](https://github.com/predictra-hq/predictra/actions/runs/43720105371)): aggiunte la pagina Certezze e le versioni da telefono (375 px) di Certezze, Partite e dettaglio partita, con screenshot nell'artefatto del run (3 giorni).

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

## Limiti

- axe trova circa un terzo dei problemi WCAG. Restano da provare a mano, con NVDA o VoiceOver, l'ordine di lettura e gli annunci delle Server Action.
- Due pagine non sono state controllate con dati reali:
  - il dettaglio di una proposta del Bet Builder, perché su DEV non c'erano proposte;
  - il Tracker con giocate, perché l'account temporaneo non ne ha.

  Il controllo le include in automatico quando i dati ci sono.
