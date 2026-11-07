# Lavorare in parallelo — regole del team

PREDICTRA è sviluppata da più persone contemporaneamente, ognuna con il proprio Claude Code (sul web o in locale). Queste regole servono a lavorare su cose separate nella stessa milestone e poi unire tutto senza conflitti. Valgono per tutte le milestone e per persone e agenti allo stesso modo.

Il piano di ogni milestone, già diviso in corsie, è in [docs/roadmap/](../roadmap/README.md). La decisione è registrata in [ADR 0009](../decisions/0009-lavoro-in-parallelo.md).

## 1. Il metodo: prima il contratto, poi le corsie

Ogni milestone si svolge in tre tempi:

1. **Corsia 0 — contratto.** Una sola persona, una PR piccola, prima di tutto il resto. Contiene ciò da cui dipendono tutti: ADR della milestone, data dictionary, migrazione con tabelle, viste e RLS (con i test), tipi condivisi in `packages/shared-types`. Si fa il merge su `dev` **prima** di aprire le altre corsie.
2. **Corsie A e B, in parallelo.** Ognuna lavora solo sui file che il piano le assegna. Di regola **A = dati, backend e job**, **B = interfaccia e pagine**. Le due corsie comunicano solo attraverso il contratto (tabelle e viste), non chiamando codice l'una dell'altra.
3. **Chiusura.** Integrazione, verifica su DEV dei criteri di completamento, aggiornamento di stato e documentazione.

Se durante il lavoro serve cambiare il contratto, non lo si cambia dentro la propria corsia: si apre una **PR dedicata e piccola** (nuova migrazione, tipi aggiornati) e si avvisa l'altra persona nella issue.

Anche **milestone indipendenti possono andare in parallelo** (per esempio M3 e M4 dopo M2): in quel caso ognuno prende una milestone intera. Le dipendenze sono nella [roadmap](../roadmap/README.md).

## 2. Chi fa cosa

- Ogni corsia è una **issue GitHub** con le etichette `M<N>` e `corsia:0`, `corsia:A` o `corsia:B`, assegnata a una persona. Le etichette si creano la prima volta da _Issues → Labels_.
- Nel piano della milestone la tabella **Assegnazione** dice chi ha preso quale corsia: la aggiorna chi prende la corsia, nella sua prima PR.
- Una persona lavora su una corsia alla volta. Se si blocca, lo scrive nella issue.

## 3. Branch e Pull Request

| Lavoro                     | Nome del branch         | Esempio                              |
| -------------------------- | ----------------------- | ------------------------------------ |
| Contratto della milestone  | `feature/m<N>-0-<slug>` | `feature/m2-0-modello-dati`          |
| Corsia A                   | `feature/m<N>-a-<slug>` | `feature/m2-a-adapter-football-data` |
| Corsia B                   | `feature/m<N>-b-<slug>` | `feature/m2-b-match-center`          |
| Correzione al contratto    | `feature/m<N>-0-<slug>` | `feature/m2-0-vista-classifiche`     |
| Documentazione, operazioni | `feature/docs-<slug>`   | `feature/docs-collaborazione`        |

- Ogni branch parte da `dev` aggiornato e la PR va verso `dev`. `main` riceve solo merge da `dev`.
- **PR piccole**: una fase del piano per PR (indicativamente meno di 400 righe modificate). Più sono piccole, meno conflitti.
- Si fa il merge **solo con CI verde**. L'altra persona dà un'occhiata quando può; per la sola documentazione non serve aspettare.
- Metodo di merge: **Squash and merge** da `feature/*` a `dev` (un commit per PR); **Create a merge commit** da `dev` a `main`.
- Dopo il merge il branch si cancella (pulsante _Delete branch_).
- La descrizione della PR segue il modello in `.github/pull_request_template.md`.

## 4. Restare allineati

- All'inizio di ogni sessione si porta `dev` dentro il proprio branch (merge di `dev`, oppure _Update branch_ dalla pagina della PR).
- Prima del merge, se GitHub mostra _This branch is out-of-date_, si usa **Update branch** e si aspetta di nuovo la CI.
- Ogni merge su `dev` avvia il **deploy di DEV**: `dev` deve restare sempre verde. Se un merge rompe DEV, la priorità di chi l'ha fatto è sistemarlo, anche con un _Revert_ della PR.

## 5. File a rischio di conflitto

| File o cartella                               | Regola                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/`                        | Una migrazione è sempre un **file nuovo**; quelle già su `dev` non si modificano. Il timestamp del nome (`AAAAMMGGhhmmss_nome.sql`) deve essere **successivo** all'ultimo già su `dev` al momento del merge: se nel frattempo l'altra corsia ne ha unita una più recente, rinomina la tua con un timestamp nuovo prima del merge. |
| `apps/web/src/lib/i18n/it.ts`                 | Lo modifica solo la corsia che fa l'interfaccia. Le chiavi nuove vanno in un blocco per area (es. `matchCenter`, `dataCenter`), senza riordinare quelle esistenti.                                                                                                                                                                |
| `apps/web/src/components/shell/nav-config.ts` | Lo modifica la corsia che attiva la voce di menu.                                                                                                                                                                                                                                                                                 |
| `packages/shared-types/`                      | Solo nella corsia 0 o in una PR di correzione del contratto.                                                                                                                                                                                                                                                                      |
| `pnpm-lock.yaml`                              | Non si risolve a mano: si prende la versione di `dev` e si rigenera con `pnpm install`.                                                                                                                                                                                                                                           |
| `.github/workflows/`                          | I workflow nuovi li aggiunge la corsia che ne ha bisogno. Quelli esistenti (`ci.yml`, `deploy-target.yml`) si toccano con una PR dedicata, avvisando l'altra persona.                                                                                                                                                             |
| `.env.example`                                | Ogni corsia aggiunge i nomi delle sue variabili in fondo, nel blocco della milestone.                                                                                                                                                                                                                                             |
| `docs/data-dictionary/`                       | Un file per area; ogni corsia aggiorna la propria sezione.                                                                                                                                                                                                                                                                        |
| `README.md`, `CLAUDE.md`, `docs/roadmap/`     | Lo stato delle milestone si aggiorna nella PR di chiusura; la riga _Assegnazione_ nella prima PR di ogni corsia.                                                                                                                                                                                                                  |

Perché la regola sulle migrazioni: il deploy applica le migrazioni in ordine di timestamp con `supabase db push`. Se su DEV esiste già una migrazione più recente della tua, il deploy si ferma con un errore.

## 6. Segreti, account e ambienti

- I segreti di GitHub li aggiunge solo **`gennpalm`** (proprietario del repository), che è anche l'unico a poter avviare il workflow _Bootstrap Super Admin_.
- Se una corsia ha bisogno di un segreto nuovo (per esempio una API key), lo chiede nella issue indicando il **nome esatto**. Il codice lo legge sempre da variabile d'ambiente e `.env.example` ne documenta il nome.
- Mai valori di segreti in chat, issue, PR, commit o log.
- Lo stato di ambienti, account e credenziali in scadenza è in [ambienti.md](ambienti.md).

## 7. Lavorare con Claude Code

Si può lavorare da **Claude Code sul web** (claude.ai/code, collegato a `gennpalm/predictra`) o in locale (Node.js 22 o superiore e pnpm 10). Controlli, test, migrazioni e deploy girano comunque su GitHub Actions: non serve installare nulla.

Messaggio di avvio consigliato per ogni sessione:

```text
Lavoro su PREDICTRA: milestone M2, corsia A (piano: docs/roadmap/M2-football-data.md).
Parti da dev aggiornato, branch feature/m2-a-<slug>. Tocca solo i file della corsia A.
Segui CLAUDE.md e docs/operations/collaborazione.md. Apri una PR verso dev e portala a CI verde.
```

Claude legge da solo `CLAUDE.md`. Se per completare il lavoro deve modificare un file che non appartiene alla corsia, si ferma e lo segnala invece di procedere.

## 8. Chiudere una milestone

1. Tutte le PR delle corsie sono su `dev`, con CI e deploy DEV verdi.
2. Si verificano su DEV i criteri di completamento del piano della milestone.
3. Si aggiornano lo stato in `README.md`, `CLAUDE.md` e `docs/roadmap/README.md`, e la documentazione toccata (ADR, data dictionary, setup, security).
4. Quando l'ambiente PROD esisterà: PR da `dev` a `main`.
