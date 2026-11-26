-- Avviso sullo spazio del database (M8, checklist di produzione §4; ADR 0041, 0077).
--
-- Il piano Free di Supabase ammette 500 MB: oltre, il progetto passa in sola lettura e le
-- raccolte si fermano. Il 17/11/2026 PROD occupava 91 MB e cresceva di circa 5 MB al giorno.
-- Il watchdog dell'agente, che gira dopo ogni ciclo, ora avvisa anche gli amministratori:
-- - oltre 350 MB: avviso (c'è tempo per decidere la conservazione dei dati, ADR 0041);
-- - oltre 450 MB: errore (pochi giorni prima della sola lettura).
-- Una notifica per soglia alla settimana (chiave di deduplica con anno e settimana ISO).

create function app_private.database_size_alert(
  p_bytes bigint default null,
  p_warning_bytes bigint default 350 * 1024 * 1024,
  p_error_bytes bigint default 450 * 1024 * 1024
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_bytes bigint := coalesce(p_bytes, pg_database_size(current_database()));
  v_level text;
  v_mb integer := (v_bytes / (1024 * 1024))::integer;
begin
  if v_bytes >= p_error_bytes then
    v_level := 'error';
  elsif v_bytes >= p_warning_bytes then
    v_level := 'warning';
  else
    return 0;
  end if;
  return app_private.notify_agent_monitors(
    'database.size',
    v_level::public.notification_severity,
    format('Spazio del database: %s MB su 500', v_mb),
    case v_level
      when 'error' then
        'Mancano pochi giorni al limite del piano Free: oltre 500 MB il database passa in sola lettura e le raccolte si fermano. Serve decidere subito la conservazione dei dati (ADR 0041).'
      else
        'Il database cresce ogni giorno con previsioni e quote. Va decisa la conservazione dei dati (ADR 0041) prima del limite di 500 MB del piano Free.'
    end,
    '/admin/agent',
    format('database.size:%s:%s', v_level, to_char(now() at time zone 'UTC', 'IYYY-IW')),
    null
  );
end;
$$;

revoke all on function app_private.database_size_alert(bigint, bigint, bigint) from public, anon, authenticated;

-- Stesso corpo della migrazione 20261109120000, più il controllo dello spazio.
create or replace function public.agent_watchdog()
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
  v_total := v_total + app_private.database_size_alert();
  return v_total;
end;
$$;
