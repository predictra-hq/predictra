# ADR 0002 — Hosting a costo zero

**Stato:** Accettata (approvata il 2026-11-07) · **Data:** 2026-11-07

## Contesto

Budget ricorrente: €0. Limiti verificati il 7/11/2026:

- Vercel Hobby: funzioni fino a 300 s, cron solo giornalieri, uso personale non commerciale.
- Supabase Free: 500 MB, pausa dopo 7 giorni di inattività, nessun backup automatico, MFA base incluso.
- GitHub Actions: $12/mese di compute nei repo privati (~2.000 min Linux), cron con minimo 5 min ma non garantito.
- Upstash QStash Free: 1.000 messaggi/giorno, 10 schedule.
- Render Free non offre worker né cron. Cloudflare Workers Free ha 10 ms di CPU.

## Decisione

- **Web + API:** Next.js su Vercel Hobby.
- **DB + Auth:** Supabase Free, un progetto per staging e uno per produzione.
- **Scheduler leggero:** QStash chiama endpoint `/api/jobs/*` firmati, ogni 10–15 min.
- **Job pesanti (Python):** GitHub Actions schedulate ogni 1–3 h.
- **Backup:** `pg_dump` giornaliero da GitHub Actions verso storage separato, con test di restore periodico.

## Conseguenze

- Nessun processo è sempre attivo: l'agente è a cicli, e la UI mostra la cadenza reale e l'ultimo ciclo.
- Se PREDICTRA diventa commerciale serve Vercel Pro.
- Il consumo di minuti GitHub Actions va monitorato: al termine del credito i job si fermano fino al mese successivo.
