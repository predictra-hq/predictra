# ADR 0009 — Lavoro in parallelo per corsie

**Stato:** Accettata · **Data:** 2026-11-07

## Contesto

- Due persone sviluppano PREDICTRA nello stesso momento, ognuna con il proprio Claude Code, spesso sulla stessa milestone.
- Con GitHub Free sui repository privati non c'è protezione dei branch: le regole sono di team, non vincoli tecnici (ADR 0008).
- Ogni merge su `dev` avvia il deploy di DEV, migrazioni comprese: un conflitto non risolto o una migrazione fuori ordine fermano l'ambiente per tutti.
- `supabase db push` applica le migrazioni in ordine di timestamp e si ferma se trova un file locale più vecchio dell'ultima migrazione già applicata.

## Decisione

- Ogni milestone si divide in **corsia 0** (contratto: ADR, data dictionary, migrazione con RLS e test, tipi condivisi), poi **corsie A e B** in parallelo (di regola dati/backend e interfaccia), poi chiusura. Le corsie comunicano solo attraverso il contratto.
- Il piano di ogni milestone (`docs/roadmap/M<N>-*.md`) elenca per ogni corsia i file di sua proprietà, le fasi e i criteri di completamento.
- Branch `feature/m<N>-<0|a|b>-<slug>`, PR piccole verso `dev`, merge solo con CI verde, **Squash and merge** verso `dev`.
- Migrazioni: sempre file nuovi, con timestamp successivo all'ultimo presente su `dev` al momento del merge (si rinomina se serve).
- File condivisi ad alto rischio di conflitto (i18n, menu, tipi condivisi, lockfile, workflow) hanno un proprietario o una regola, descritti in `docs/operations/collaborazione.md`.
- Assegnazione delle corsie tramite issue GitHub (etichette `M<N>`, `corsia:*`) e tabella _Assegnazione_ nel piano.

## Conseguenze

- All'inizio di ogni milestone c'è un breve passo seriale (corsia 0); dopo, le due persone lavorano senza toccare gli stessi file.
- Un cambio di contratto in corsa costa una PR dedicata in più, ma resta visibile a tutti.
- Milestone indipendenti (es. M3 e M4) si possono assegnare per intero a persone diverse.
