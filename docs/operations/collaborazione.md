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

**Regola dei branch:** `gennpalm` lavora direttamente su `dev` (dal 14/11/2026); il collega (o chiunque altro sviluppi) lavora **solo su branch `feature/*`** e apre una PR verso `dev`; il merge lo fa `gennpalm`. GitHub **cancella automaticamente il branch** appena la PR viene unita (_Settings → General → Automatically delete head branches_, attivo dall'8/11/2026). Quindi nella pagina _Branches_ restano solo `main`, `dev` e il lavoro **non ancora unito**: se esiste un branch `feature/*`, quel lavoro non è ancora in `dev`. Dopo un merge non si continua sullo stesso branch: si riparte da `dev` aggiornato con un branch nuovo.

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
- Metodo di merge: **Create a merge commit**, eseguito **solo da `gennpalm`** (proprietario), sia da `feature/*` a `dev` sia da `dev` a `main`. Sul piano Vercel Hobby si pubblicano solo commit del proprietario: un merge fatto da altri, o con _Squash and merge_, blocca il deploy ([ADR 0050](../decisions/0050-deploy-solo-commit-del-proprietario.md)).
- `gennpalm` può fare push direttamente su `dev` (dal 14/11/2026), solo con tutti i controlli della CI verdi in locale. Il collega passa sempre da una PR. Su `main` si arriva solo con una PR da `dev`.
- Dopo il merge GitHub **cancella da solo il branch** (impostazione _Automatically delete head branches_). Per altro lavoro si riparte da `dev` aggiornato con un branch nuovo: mai continuare su un branch già unito.
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

## 6. Milestone diverse in parallelo e dipendenze non ancora unite

Capita che una persona stia ancora lavorando alla milestone N (non ancora su `dev`) e l'altra voglia iniziare una milestone successiva che ne dipende. Si gestisce così.

### 6.1 Da cosa si dipende davvero

Ogni piano in `docs/roadmap/` ha la voce **Può partire quando**. Quasi sempre basta che sia su `dev` il **contratto** (corsia 0) della milestone da cui si dipende, non la milestone intera: per questo la corsia 0 si fa e si unisce per prima.

- Se il contratto che ti serve è già su `dev`: parti normalmente da `dev`. Lavori sulle tabelle e sulle viste del contratto; finché mancano i dati reali usi fixture registrate o lo stato vuoto.
- Se il contratto non è ancora su `dev`: chiedi nella issue di quella milestone di anticipare la sua corsia 0. È una PR piccola, è il modo più veloce di sbloccare tutti.
- Nel frattempo puoi lavorare sulle parti della tua milestone che non dipendono da nulla (molte corsie 0 e B si possono iniziare subito: vedi la roadmap).

### 6.2 Se proprio serve codice non ancora unito (branch in pila)

Da usare solo quando non c'è alternativa:

1. Crea il tuo branch **dal branch del collega** (es. da `feature/m2-a-adapter-football-data`), non da `dev`.
2. Apri la PR con **base = il branch del collega** e scrivi nella descrizione `Bloccata da #<numero della PR del collega>`.
3. Non fare il merge finché la PR del collega non è su `dev`.
4. Quando la PR del collega è stata unita, porta `dev` nel tuo branch (merge di `dev`) e cambia la base della tua PR in `dev` (_Edit_ accanto al titolo della PR). I merge sono commit di merge, quindi non serve riscrivere la cronologia. In cloud basta chiederlo a Claude con queste parole.
5. Ricontrolla le migrazioni: le tue devono avere un timestamp successivo a tutte quelle unite nel frattempo.

### 6.3 Spazi riservati per milestone

Per evitare conflitti quando due milestone vanno avanti insieme, ogni milestone usa nomi e numeri suoi:

| Milestone | ADR riservati | Tipi condivisi (`packages/shared-types/src/`) | Data dictionary (`docs/data-dictionary/`) | Chiavi i18n (`it.ts`)                                          |
| --------- | ------------- | --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| M2        | 0010–0014     | `football.ts`                                 | `football.md`                             | `matchCenter`, `dataCenter`                                    |
| M3        | 0015–0019     | `odds.ts`                                     | `odds.md`                                 | `marketIntelligence`, `statisticsCenter`, `leagueIntelligence` |
| M4        | 0020–0024     | `predictions.ts`                              | `predictions.md`                          | `modelIntelligence`, `predictions`                             |
| M5        | 0025–0029     | `bet-builder.ts`                              | `bet-builder.md`                          | `betBuilder`                                                   |
| M6        | 0030–0034     | `bankroll.ts`                                 | `bankroll.md`                             | `bankroll`, `tracker`                                          |
| M7        | 0035–0039     | `agent.ts`                                    | `agent.md`                                | `agent`                                                        |
| M8        | 0040–0044     | —                                             | —                                         | `ask` (se approvato)                                           |
| Altro     | da 0050       | —                                             | —                                         | —                                                              |

Ogni milestone aggiunge il proprio file in `packages/shared-types/src/` e una sola riga di export in `index.ts`; nel menu (`nav-config.ts`) cambia solo la riga della propria voce.

## 7. Segreti, account e ambienti

- I segreti di GitHub li aggiunge solo **`gennpalm`** (proprietario del repository), che è anche l'unico a poter avviare il workflow _Bootstrap Super Admin_.
- Se una corsia ha bisogno di un segreto nuovo (per esempio una API key), lo chiede nella issue indicando il **nome esatto**. Il codice lo legge sempre da variabile d'ambiente e `.env.example` ne documenta il nome.
- Mai valori di segreti in chat, issue, PR, commit o log.
- Lo stato di ambienti, account e credenziali in scadenza è in [ambienti.md](ambienti.md).

## 8. Lavorare con Claude Code

Si può lavorare da **Claude Code sul web** (claude.ai/code, collegato a `predictra-hq/predictra`) o in locale (Node.js 22 o superiore e pnpm 10). Controlli, test, migrazioni e deploy girano comunque su GitHub Actions: non serve installare nulla.

Messaggio di avvio consigliato per ogni sessione:

```text
Lavoro su PREDICTRA: milestone M2, corsia A (piano: docs/roadmap/M2-football-data.md).
Parti da dev aggiornato, branch feature/m2-a-<slug>. Tocca solo i file della corsia A.
Segui CLAUDE.md e docs/operations/collaborazione.md. Apri una PR verso dev e portala a CI verde.
```

Claude legge da solo `CLAUDE.md`. Se per completare il lavoro deve modificare un file che non appartiene alla corsia, si ferma e lo segnala invece di procedere.

## 9. Chiudere una milestone

1. Tutte le PR delle corsie sono su `dev`, con CI e deploy DEV verdi.
2. Si verificano su DEV i criteri di completamento del piano della milestone.
3. Si aggiornano lo stato in `README.md`, `CLAUDE.md` e `docs/roadmap/README.md`, e la documentazione toccata (ADR, data dictionary, setup, security).
4. Quando l'ambiente PROD esisterà: PR da `dev` a `main`.
   - Dopo il merge di una PR da `dev` a `main`, GitHub cancella `dev` (opzione _Automatically delete head branches_). Il workflow _Ripristino di dev_ lo ricrea da solo allo stesso commit entro un minuto. Se non lo fa, si usa **Restore branch** nella pagina della PR. Successo il 9/11/2026 con la PR #48.
   - Prima del merge si aspetta la CI verde della PR: unendo subito, il run della PR parte dopo il merge.
