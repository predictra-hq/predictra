# M8 — Hardening e produzione: piano e corsie

**Stato:** in corso (A1 backup) · **Dipende da:** tutte · **Può partire quando:** backup e test di restore **subito** (servono già per DEV); il resto quando M2–M7 sono su `dev` · **Regole di lavoro:** [collaborazione.md](../operations/collaborazione.md)

## Obiettivo

Rendere PREDICTRA pronta per l'uso reale: sicurezza rivista, backup verificati, accessibilità, procedure scritte e ambiente di produzione attivo.

Criteri di completamento: il [piano M0](../architecture/M0-piano-tecnico.md) §6 rimanda ai paragrafi **§23.3 e §26 del Prompt Master**, che **non sono nel repository** (vedi Prerequisiti, P1).

## Assegnazione

| Corsia                      | Persona   | Issue | Stato                                                                                                              |
| --------------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| 0 — criteri e checklist     | —         | —     | bozza: [checklist](../operations/checklist-produzione.md) da approvare; ADR 0041 proposto                          |
| A — sicurezza, backup, PROD | Alfry1299 | —     | A1 (backup), A2 (CSP con nonce, audit) e A3 (revisione di sicurezza) in servizio; da fare: step-up 2FA e A4 (PROD) |
| B — accessibilità e runbook | Alfry1299 | —     | B1: [esito](../operations/accessibilita.md); B2: [runbook](../operations/runbook.md); B3: checklist in bozza       |

## Prerequisiti

| #   | Cosa                                                                                                                                                                            | Chi        | Serve a                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| P1  | Aggiungere al repository i criteri §23.3 e §26 del Prompt Master (o l'intero documento in `docs/architecture/`)                                                                 | `gennpalm` | corsia 0                                                                                         |
| P2  | Scelta dello storage separato per i backup (gratuito, privato, cifrato): opzioni e proposta nell'[ADR 0040](../decisions/0040-backup.md), **decide `gennpalm`**                 | `gennpalm` | ADR 0040                                                                                         |
| P3  | Nuovo progetto Supabase `predictra-prod` e nuovo progetto Vercel `predictra-prod`, con i segreti `PROD_*` (setup.md §7)                                                         | `gennpalm` | fase A4                                                                                          |
| P4  | Decisione su Ask PREDICTRA: disattivata in v1 (decisione D6 del piano M0); un LLM a pagamento richiede l'approvazione esplicita del proprietario e non deve mai produrre numeri | `gennpalm` | [ADR 0042](../decisions/0042-ask-predictra.md) (proposta: Groq gratuito, niente numeri dall’LLM) |

## Cosa serve dalle altre milestone

Tutte le milestone precedenti su `dev`, salvo backup e restore che si possono fare subito su DEV.

## Decisioni da prendere (ADR 0040–0044)

- **ADR 0040 — Backup:** `pg_dump` giornaliero da GitHub Actions verso lo storage scelto, cifratura, conservazione, test di restore mensile (ADR 0002).
- **ADR 0041 — Retention:** [proposta](../decisions/0041-retention.md) del 14/11/2026, da confermare. Durata di conservazione di `audit_logs`, inviti e dati personali (in `docs/data-dictionary/identity.md` risultano "da definire in M8").
- **ADR 0042 — Ask PREDICTRA:** [accettato](../decisions/0042-ask-predictra.md): chat con Groq (piano gratuito), strumenti in sola lettura e controllo sui numeri; pagina `/ask`.
- Passaggio a GitHub Pro per la protezione dei branch (costo: serve l'approvazione del proprietario).

## Corsia 0 — criteri e checklist

**File:** [`docs/operations/checklist-produzione.md`](../operations/checklist-produzione.md) (bozza del 14/11/2026) con i criteri di §23.3 e §26, ADR 0040–0042.

**Fatto quando:** checklist approvata dal proprietario.

## Corsia A — sicurezza, backup, produzione

**File di proprietà:** `.github/workflows/backup.yml` (nuovo), `next.config.ts` e `apps/web/src/proxy.ts` per la CSP, le migrazioni di hardening, `docs/operations/security.md`, `docs/operations/backup-restore.md` (nuovo).

| Fase | Contenuto                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1   | Backup giornaliero e primo test di restore documentato                                                                                                                                                                   |
| A2   | Chiusura delle limitazioni note in `security.md`: CSP con nonce al posto di `'unsafe-inline'`, step-up TOTP per le azioni distruttive, audit con filtri e paginazione, verifica della protezione da password compromesse |
| A3   | Security review completa (RLS di tutte le tabelle, segreti, dipendenze, log)                                                                                                                                             |
| A4   | Ambiente PROD: progetti, segreti `PROD_*`, merge di `dev` in `main`, workflow Bootstrap Super Admin con ambiente `prod`, verifica finale                                                                                 |

## Corsia B — accessibilità e runbook

**File di proprietà:** componenti in `apps/web/src/components/ui/**` e correzioni di accessibilità nelle pagine (una PR per area, avvisando chi le ha scritte), `docs/operations/runbook.md` (nuovo).

| Fase | Contenuto                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| B1   | Audit di accessibilità (contrasto, tastiera, screen reader) e correzioni                                          |
| B2   | Runbook: deploy, rollback, rinnovo dei token, provider non raggiungibile, minuti GitHub Actions esauriti, restore |
| B3   | Verifica finale della checklist di produzione                                                                     |

## Chiusura di M8

1. Checklist di produzione completata e approvata.
2. PROD in servizio e aggiornato da `main`; restore testato.
3. Stato aggiornato in `README.md`, `CLAUDE.md`, nella [roadmap](README.md) e in `docs/operations/ambienti.md`.
