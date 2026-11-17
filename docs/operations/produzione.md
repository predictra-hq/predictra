# Messa in produzione — cosa fare, passo per passo

Per il proprietario (`gennpalm`). Tempo stimato: un'ora e mezza, in due momenti. Scelta di fondo: [ADR 0055](../decisions/0055-una-sola-raccolta-prod-copia-su-dev.md), cioè solo PROD scarica i dati dalle fonti e DEV ne riceve una copia ogni giorno, senza chiamate in più.

Il codice è pronto su `dev`. Finché non fai il passo 9 tutto continua a funzionare come oggi, su DEV: i passi 1–8 non cambiano nulla per nessuno.

**Vercel e i repository delle organizzazioni.** Il piano gratuito di Vercel non importa un repository di un'organizzazione GitHub. A noi non serve: la pipeline costruisce e pubblica il sito da GitHub Actions con un token, senza il collegamento Git di Vercel. Il progetto PROD lo crea un workflow (passo 4), senza importare il repository.

Dove si trovano i segreti di GitHub (servono in più passi): github.com → `predictra-hq/predictra` → _Settings_ (in alto, a destra di _Insights_) → nel menu a sinistra _Secrets and variables → Actions_. Scheda _Secrets_ per i segreti, scheda _Variables_ per le variabili. Bottone verde _New repository secret_ (o _New repository variable_): nome esattamente come scritto qui, valore, _Add secret_.

---

## Parte 1 — Preparazione (non cambia nulla per nessuno)

### 1. Supabase: annota i dati del progetto PROD ✅ progetto già creato

Apri il progetto PROD su [supabase.com/dashboard](https://supabase.com/dashboard) e annota tre valori (in un posto sicuro, mai in chat):

1. **Project ID**: ingranaggio _Project Settings_ (in basso a sinistra) → _General_ → _Project ID_. Sono circa 20 lettere minuscole, es. `abcdefghijklmnopqrst`. È anche la prima parte dell'indirizzo `https://<Project ID>.supabase.co`.
2. **Password del database**: quella scelta alla creazione. Se non la ricordi: _Project Settings → Database → Database password → Reset database password_, generane una nuova e copiala subito.
3. **Chiave secret**: _Project Settings → API Keys_ → sezione _Secret keys_. Se non ce n'è una: _Create new secret key_ (nome `predictra`). Clicca l'occhio per mostrarla e copiala: inizia con `sb_secret_`.

La chiave _publishable_ (`sb_publishable_…`) non serve copiarla: la legge il workflow del passo 4.

Controlla anche, in _Project Settings → General_, che la regione sia la stessa di DEV (Europa). Se è diversa funziona lo stesso, ma il sito è un po' più lento.

### 2. GitHub: primi tre segreti

Nella scheda _Secrets_ (vedi sopra) crea:

| Nome                        | Valore                            |
| --------------------------- | --------------------------------- |
| `PROD_SUPABASE_PROJECT_ID`  | Project ID del passo 1.1          |
| `PROD_SUPABASE_DB_PASSWORD` | password del database (passo 1.2) |
| `PROD_SUPABASE_SECRET_KEY`  | chiave `sb_secret_…` (passo 1.3)  |

Il token `SUPABASE_ACCESS_TOKEN` già presente vale per tutti i progetti del tuo account Supabase: non va cambiato.

### 3. GitHub: porta il codice su `main`

Serve perché i workflow avviabili a mano (passi 4, 7, 8, 11) compaiono in _Actions_ solo quando sono su `main`. È sicuro: senza i segreti del passo 5 il deploy di PROD viene saltato, e senza la variabile del passo 9 l'agente continua a lavorare su DEV.

1. github.com → `predictra-hq/predictra` → _Pull requests → New pull request_.
2. _base_: `main`, _compare_: `dev` → _Create pull request_ → titolo `Rilascio`, _Create pull request_.
3. Aspetta che i controlli siano verdi (circa 10 minuti).
4. _Merge pull request_ → dal menu della freccia scegli **Create a merge commit** → _Confirm merge_.
5. Se GitHub cancella il branch `dev`, il workflow _Ripristino di dev_ lo ricrea da solo entro un minuto. Non cliccare _Delete branch_.
6. In _Actions_ il run _CI_ su `main` diventa verde; il job _Deploy PROD_ risulta saltato con l'avviso «Segreti mancanti»: è normale a questo punto.

### 4. Vercel: crea il progetto PROD con il workflow

1. _Actions_ → nella colonna a sinistra **Prepara Vercel PROD** → _Run workflow_ → branch `main` → _Run workflow_.
2. Aspetta il segno verde (un minuto). Il workflow:
   - crea il progetto `predictra-prod` con le stesse impostazioni di DEV, **senza** collegarlo al repository;
   - gli assegna un indirizzo pubblico, di solito `https://predictra-prod.vercel.app`;
   - imposta da solo `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_BASE_URL`, `GITHUB_DISPATCH_REF` e `SUPABASE_SECRET_KEY`.
3. Apri il run → in basso, nel riquadro _Summary_, trovi due valori: **`PROD_VERCEL_PROJECT_ID`** (inizia con `prj_`) e **`PROD_APP_BASE_URL`** (l'indirizzo del sito).

Se il workflow non compare in _Actions_, il passo 3 non è ancora finito. Se si ferma con un errore, mandami il messaggio rosso.

### 5. GitHub: ultimi due segreti

Nella scheda _Secrets_ crea:

| Nome                     | Valore                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| `PROD_VERCEL_PROJECT_ID` | valore `prj_…` del passo 4                                                       |
| `PROD_APP_BASE_URL`      | indirizzo del passo 4, es. `https://predictra-prod.vercel.app`, senza `/` finale |

### 6. Vercel: le quattro chiavi da aggiungere a mano

Su Vercel queste chiavi sono salvate come _Sensitive_: non si possono rileggere da DEV, quindi vanno prese dalla loro fonte.

Dove si aggiungono: [vercel.com](https://vercel.com) → progetto **predictra-prod** → _Settings → Environment Variables_ → _Add New_ → nome, valore, spunta **Sensitive**, ambiente solo **Production** → _Save_.

1. **`GROQ_API_KEY`** (Chiedi a PREDICTRA): [console.groq.com](https://console.groq.com) → _API Keys_ → _Create API Key_ → nome `predictra-prod` → copia la chiave (inizia con `gsk_`, si vede una volta sola). Se la salti, la chat resta spenta su PROD e il resto funziona.
2. **`QSTASH_CURRENT_SIGNING_KEY`** e 3. **`QSTASH_NEXT_SIGNING_KEY`**: [console.upstash.com](https://console.upstash.com) → _QStash_ → sezione _Signing Keys_ (o _Quickstart_). Sono le stesse di DEV: copiale entrambe. Annota anche la regione in alto (EU o US): serve al passo 10.
3. **`GITHUB_DISPATCH_TOKEN`** (avvio di riserva dell'agente): github.com → foto profilo → _Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token_:
   - _Token name_: `predictra-agent-dispatch-prod`;
   - _Resource owner_: `predictra-hq`;
   - _Expiration_: 1 anno (annota la scadenza);
   - _Repository access_: _Only select repositories_ → `predictra-hq/predictra`;
   - _Permissions → Repository permissions → Actions_: **Read and write**, nient'altro;
   - _Generate token_ → copia il valore (`github_pat_…`, si vede una volta sola).

Se l'organizzazione chiede l'approvazione del token, approvalo da _predictra-hq → Settings → Personal access tokens → Pending requests_.

### 7. Prima pubblicazione di PROD

1. _Actions_ → **CI** → apri l'ultimo run sul branch `main` (quello del passo 3) → in alto a destra _Re-run jobs_ → _Re-run all jobs_.
2. Il job _Deploy PROD_ ora parte davvero: crea le tabelle nel database di PROD, applica le impostazioni di accesso e pubblica il sito (10–15 minuti).
3. Apri l'indirizzo del passo 4: deve comparire la pagina di accesso di PREDICTRA. Non hai ancora un account: si crea al passo 11.

Se _Deploy PROD_ si ferma, mandami il nome dello step rosso e il messaggio.

---

## Parte 2 — Accensione (passi 8–10 di seguito, nella stessa ora)

### 8. Riempi PROD con i dati di DEV (una volta sola)

1. _Actions_ → **Copia dati tra ambienti** → _Run workflow_ → branch `main`, _Direzione_ **`dev-to-prod`** → _Run workflow_.
2. Dura circa 5 minuti. Alla fine il log mostra una tabella con le righe di ogni tabella in DEV e in PROD: i numeri sono uguali (al massimo qualche riga in meno su `ingestion_runs`, se nel frattempo l'agente stava lavorando).

Si copiano partite, classifiche, quote, statistiche, previsioni e schedine. **Non** si copiano account, bankroll e giocate: su PROD partirai da zero.

### 9. Accendi PROD

1. GitHub → _Settings → Secrets and variables → Actions_ → scheda **Variables** → _New repository variable_.
2. Nome `DATA_TARGET`, valore `prod` → _Add variable_.

Da questo momento:

- agente, raccolte, previsioni, schedine e backup lavorano su PROD;
- DEV non chiama più le fonti e riceve una copia dei dati ogni mattina alle 06:23 (ora italiana).

### 10. QStash: sposta il richiamo dell'agente su PROD

1. [console.upstash.com](https://console.upstash.com) → _QStash_ → scheda **Schedules**.
2. C'è uno schedule con destinazione `https://predictra-dev.vercel.app/api/jobs/cycle`. Aprilo (o eliminalo e ricrealo) e metti come destinazione `https://<indirizzo PROD>/api/jobs/cycle`.
3. Lascia il resto uguale: metodo `POST`, cron `*/15 * * * *`, **retry 0**. Deve restare un solo schedule.

---

## Parte 3 — Il tuo account e la verifica

### 11. Il tuo Super Admin su PROD

1. _Actions_ → **Bootstrap Super Admin** → _Run workflow_ → branch `main`, _Ambiente_ **`prod`**, _Email_ la tua → _Run workflow_.
2. Apri il run → riquadro _Summary_: c'è il link di attivazione (monouso, vale 24 ore).
3. Aprilo, scegli nome e password (almeno 12 caratteri), poi in _Profilo → Sicurezza_ attiva la **2FA** con l'app di autenticazione.
4. Torna sul run → menu ⋯ in alto a destra → _Delete workflow run_ (il link non deve restare in giro).

### 12. Invita gli altri

- Su PROD: _Profilo → Amministrazione → Utenti e accessi → Inviti_. Anche il collega va invitato di nuovo: gli account di DEV non passano in PROD.
- Il link si consegna a mano (la piattaforma non invia email).

### 13. Crea il tuo bankroll su PROD

_Soldi → Bankroll → Nuovo bankroll_: nome, tipo (Reale o Simulato) e il sito dove giochi.

### 14. Controlli (spunta)

- [ ] Accesso con 2FA su PROD.
- [ ] Partite, Certezze e Schedine mostrano dati.
- [ ] Un utente invitato entra e non vede _Amministrazione_.
- [ ] Dopo un'ora: in _Actions_ c'è un run **Agent (Python)** su `main` verde, con «Ciclo dell'agente (PROD)».
- [ ] Il mattino dopo: **Copia dati tra ambienti** verde (programmato) e DEV aggiornato.
- [ ] La notte dopo: **Backup** verde, file `predictra-prod-…` su Backblaze B2.

---

## Dopo: come si lavora

- Si sviluppa e si prova su `dev`, come oggi: ogni push va su DEV.
- Quando una cosa è pronta: Pull Request da `dev` a `main` → _Create a merge commit_ → PROD si aggiorna da solo.
- Per provare un modello nuovo su DEV: _Actions → Prediction engine → Run workflow_ su `dev`. Scrive solo su DEV; la copia del mattino dopo lo riallinea a PROD.

## Se qualcosa va storto

- **Tornare tutto su DEV:** elimina la variabile `DATA_TARGET` (scheda _Variables_) e rimetti lo schedule QStash su DEV. L'agente torna a raccogliere su DEV dal ciclo successivo.
- **Il sito PROD non si apre:** Vercel → `predictra-prod` → _Deployments_ → l'ultimo deve essere _Ready_. Altrimenti ripeti il passo 7.
- **Copia dati rossa:** la destinazione resta com'era (la copia è tutta o niente). Mandami il messaggio dell'errore.
