-- =============================================================================
-- PREDICTRA — M7 fase A4: controllo dello stato dell'agente (watchdog)
-- =============================================================================
-- Decisione: docs/decisions/0035-pianificazione-agente.md (agent.watchdog).
-- Dizionario: docs/data-dictionary/agent.md
--
-- `agent_watchdog()` legge `v_agent_status` e, per ogni sorgente che ha già girato
-- almeno una volta ed è "degradata" (nessun ciclo riuscito oltre la soglia), notifica
-- in dashboard gli utenti con `agents.monitor`. Una sola notifica per episodio:
-- la chiave di deduplica contiene la sorgente e l'ultimo ciclo riuscito, quindi un
-- nuovo episodio (dopo un ripristino) produce una nuova notifica.
-- Chiamata da entrambi i worker (QStash e GitHub Actions): se uno si ferma, l'altro
-- se ne accorge. Eseguibile solo da service_role. Nessuna email (ADR 0008).
-- =============================================================================

create function public.agent_watchdog()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select s.source, s.last_success_at, s.degraded_after_minutes
    from public.v_agent_status s
    where s.last_run_at is not null and s.is_degraded
  loop
    v_total := v_total + app_private.notify_agent_monitors(
      'agent.degraded',
      'warning',
      format('Agente degradato: %s',
             case r.source when 'qstash' then 'QStash' else 'GitHub Actions' end),
      format('Nessun ciclo riuscito da oltre %s minuti. Ultimo riuscito: %s.',
             r.degraded_after_minutes,
             coalesce(to_char(r.last_success_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
                      'mai')),
      '/admin/agent',
      format('agent.degraded:%s:%s', r.source,
             coalesce(extract(epoch from r.last_success_at)::bigint::text, 'never')),
      null
    );
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.agent_watchdog() from public, anon, authenticated;
grant execute on function public.agent_watchdog() to service_role;
