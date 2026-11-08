-- =============================================================================
-- PREDICTRA — M7 corsia 0: agente autonomo (contratto)
-- =============================================================================
-- Decisioni: docs/decisions/0003-coda-su-postgres.md (disegno della coda),
--            docs/decisions/0035-pianificazione-agente.md (pianificazione, budget)
-- Dizionario: docs/data-dictionary/agent.md
--
-- Principi:
--  * coda su Postgres (ADR 0003): prelievo con FOR UPDATE SKIP LOCKED e lease
--    (`locked_until`); un worker interrotto lascia un lease scaduto che viene
--    ripreso al prelievo successivo;
--  * idempotenza: `idempotency_key` UNIQUE, accodare due volte la stessa chiave
--    restituisce il job esistente;
--  * retry con backoff esponenziale e jitter; superati `max_attempts` il job
--    passa a `dead` (dead-letter) e i monitor ricevono una notifica in dashboard;
--  * scrittura SOLO tramite funzioni: nemmeno service_role ha INSERT/UPDATE
--    diretti sulle tabelle della coda;
--  * code, cicli e contatori leggibili solo con `agents.monitor` (ADMIN e
--    SUPER_ADMIN, packages/shared-types/src/roles.ts);
--  * notifiche private: visibili e segnabili come lette solo dal proprietario,
--    nessuna policy per gli admin. La piattaforma non invia email (ADR 0008).
-- =============================================================================

create type public.agent_job_status as enum ('queued', 'running', 'done', 'failed', 'dead');
create type public.agent_run_source as enum ('qstash', 'github_actions', 'manual');
create type public.agent_run_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.agent_quota_window as enum ('minute', 'hour', 'day', 'month');
create type public.notification_severity as enum ('info', 'warning', 'error');

-- -----------------------------------------------------------------------------
-- Permesso agents.monitor (specchia ROLE_PERMISSIONS in roles.ts: ADMIN, SUPER_ADMIN)
-- -----------------------------------------------------------------------------
create function app_private.can_monitor_agents()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app_private.is_active_user() and app_private.is_admin();
$$;

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------

-- Cicli dell'agente (heartbeat): uno per ogni chiamata QStash o esecuzione Actions.
create table public.agent_runs (
  id             bigint generated always as identity primary key,
  source         public.agent_run_source not null,
  schedule       text not null check (schedule ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  worker_id      text not null check (char_length(worker_id) between 1 and 200),
  status         public.agent_run_status not null default 'running',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  jobs_claimed   integer not null default 0 check (jobs_claimed >= 0),
  jobs_done      integer not null default 0 check (jobs_done >= 0),
  jobs_failed    integer not null default 0 check (jobs_failed >= 0),
  error_summary  text check (char_length(error_summary) <= 2000),
  check ((status = 'running') = (finished_at is null)),
  check (finished_at is null or finished_at >= started_at)
);
create index agent_runs_started_idx on public.agent_runs (started_at desc);
create index agent_runs_source_idx on public.agent_runs (source, started_at desc);

create table public.agent_jobs (
  id               bigint generated always as identity primary key,
  type             text not null check (type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  idempotency_key  text not null unique check (char_length(idempotency_key) between 1 and 200),
  payload          jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status           public.agent_job_status not null default 'queued',
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts between 1 and 20),
  next_run_at      timestamptz not null default now(),
  locked_by        text check (char_length(locked_by) between 1 and 200),
  locked_until     timestamptz,
  last_error       text check (char_length(last_error) <= 2000),
  result           jsonb check (result is null or jsonb_typeof(result) = 'object'),
  last_run_id      bigint references public.agent_runs (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  check (attempts <= max_attempts),
  -- Il lease esiste solo mentre il job è in esecuzione.
  check ((status = 'running') = (locked_by is not null and locked_until is not null)),
  check ((status in ('done', 'dead')) = (finished_at is not null))
);
create index agent_jobs_ready_idx on public.agent_jobs (next_run_at, id)
  where status in ('queued', 'failed');
create index agent_jobs_lease_idx on public.agent_jobs (locked_until)
  where status = 'running';
create index agent_jobs_type_status_idx on public.agent_jobs (type, status);

create trigger agent_jobs_touch before update on public.agent_jobs
  for each row execute function app_private.touch_updated_at();

-- Contatori di consumo per provider e finestra (ADR 0003: rate limit in tabella;
-- ADR 0035: budget di QStash e di GitHub Actions contati qui).
create table public.agent_rate_limits (
  provider      text not null check (provider ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  window_kind   public.agent_quota_window not null,
  window_start  timestamptz not null,
  used          integer not null default 0 check (used >= 0),
  quota         integer not null check (quota > 0),
  updated_at    timestamptz not null default now(),
  primary key (provider, window_kind, window_start),
  check (used <= quota)
);

-- Notifiche in dashboard, private per utente.
create table public.notifications (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  severity       public.notification_severity not null default 'info',
  title          text not null check (char_length(title) between 1 and 200),
  body           text check (char_length(body) <= 2000),
  link           text check (link ~ '^/[^/]'),
  dedupe_key     text check (char_length(dedupe_key) between 1 and 200),
  source_job_id  bigint references public.agent_jobs (id) on delete set null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Di una notifica l'utente cambia solo `read_at`, e non prima della creazione.
create function app_private.check_notification_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.id, new.user_id, new.kind, new.severity, new.title, new.body, new.link,
      new.dedupe_key, new.created_at)
     is distinct from
     (old.id, old.user_id, old.kind, old.severity, old.title, old.body, old.link,
      old.dedupe_key, old.created_at) then
    raise exception 'Di una notifica si può cambiare solo read_at' using errcode = '42501';
  end if;
  if new.read_at is not null and new.read_at < new.created_at then
    new.read_at := now();
  end if;
  return new;
end;
$$;

create trigger notifications_check_update before update on public.notifications
  for each row execute function app_private.check_notification_update();

-- -----------------------------------------------------------------------------
-- Helper
-- -----------------------------------------------------------------------------

-- Backoff esponenziale con jitter ("equal jitter"): metà fissa, metà casuale.
--   base = 30 s · 2^(tentativo − 1), al massimo 6 ore; attesa ∈ [base/2, base].
create function app_private.agent_backoff(p_attempt integer)
returns interval
language sql volatile set search_path = ''
as $$
  select make_interval(secs =>
    least(30 * power(2, greatest(p_attempt, 1) - 1), 21600) * (0.5 + random() * 0.5));
$$;

-- Notifica tutti gli utenti con agents.monitor (account attivo, ADMIN o SUPER_ADMIN).
create function app_private.notify_agent_monitors(
  p_kind text, p_severity public.notification_severity, p_title text, p_body text,
  p_link text, p_dedupe_key text, p_job_id bigint
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notifications (user_id, kind, severity, title, body, link, dedupe_key, source_job_id)
  select distinct p.id, p_kind, p_severity, p_title, p_body, p_link, p_dedupe_key, p_job_id
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where p.status = 'ACTIVE' and ur.role in ('SUPER_ADMIN', 'ADMIN')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni per i worker (service_role)
-- -----------------------------------------------------------------------------

-- Apre un ciclo. I cicli rimasti aperti da più di 1 ora vengono chiusi come falliti.
create function public.start_agent_run(
  p_source public.agent_run_source, p_schedule text, p_worker_id text
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  update public.agent_runs
  set status = 'failed', finished_at = now(),
      error_summary = 'Ciclo interrotto: chiuso automaticamente dopo 1 ora'
  where status = 'running' and started_at < now() - interval '1 hour';
  insert into public.agent_runs (source, schedule, worker_id)
  values (p_source, p_schedule, p_worker_id)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.finish_agent_run(
  p_run_id bigint, p_status public.agent_run_status,
  p_jobs_claimed integer default 0, p_jobs_done integer default 0, p_jobs_failed integer default 0,
  p_error_summary text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status = 'running' then
    raise exception 'Lo stato finale non può essere running' using errcode = '22023';
  end if;
  update public.agent_runs
  set status = p_status, finished_at = now(),
      jobs_claimed = coalesce(p_jobs_claimed, 0),
      jobs_done = coalesce(p_jobs_done, 0),
      jobs_failed = coalesce(p_jobs_failed, 0),
      error_summary = left(p_error_summary, 2000)
  where id = p_run_id and status = 'running';
  if not found then
    raise exception 'Ciclo % inesistente o già chiuso', p_run_id using errcode = 'P0002';
  end if;
end;
$$;

-- Accoda un job. Idempotente: la stessa chiave restituisce il job esistente
-- (qualunque sia il suo stato) con created = false. Una chiave già usata da un
-- altro tipo di job è un errore.
create function public.enqueue_agent_job(
  p_type text, p_idempotency_key text, p_payload jsonb default '{}'::jsonb,
  p_run_at timestamptz default null, p_max_attempts integer default 5
) returns table (job_id bigint, created boolean, status public.agent_job_status)
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_type text;
  v_status public.agent_job_status;
begin
  insert into public.agent_jobs (type, idempotency_key, payload, next_run_at, max_attempts)
  values (p_type, p_idempotency_key, coalesce(p_payload, '{}'::jsonb),
          coalesce(p_run_at, now()), coalesce(p_max_attempts, 5))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, true, 'queued'::public.agent_job_status;
    return;
  end if;
  select j.id, j.type, j.status into v_id, v_type, v_status
  from public.agent_jobs j where j.idempotency_key = p_idempotency_key;
  if v_type <> p_type then
    raise exception 'La chiave % appartiene a un job di tipo %', p_idempotency_key, v_type
      using errcode = '23505';
  end if;
  return query select v_id, false, v_status;
end;
$$;

-- Riprende i job con lease scaduto (worker interrotto): tornano `failed` e
-- prelevabili subito, oppure `dead` se hanno esaurito i tentativi.
create function public.recover_expired_agent_jobs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select id, attempts, max_attempts, type, locked_by
    from public.agent_jobs
    where status = 'running' and locked_until < now()
    for update skip locked
  loop
    if v_job.attempts >= v_job.max_attempts then
      update public.agent_jobs
      set status = 'dead', locked_by = null, locked_until = null, finished_at = now(),
          last_error = format('Lease scaduto (worker %s interrotto); tentativi esauriti', v_job.locked_by)
      where id = v_job.id;
      perform app_private.notify_agent_monitors(
        'agent.job_dead', 'error', format('Job %s in dead-letter', v_job.type),
        'Tentativi esauriti dopo un lease scaduto.', '/admin/agent',
        format('agent.job_dead:%s:%s', v_job.id, v_job.attempts), v_job.id);
    else
      update public.agent_jobs
      set status = 'failed', locked_by = null, locked_until = null, next_run_at = now(),
          last_error = format('Lease scaduto (worker %s interrotto)', v_job.locked_by)
      where id = v_job.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Preleva fino a p_limit job pronti (FOR UPDATE SKIP LOCKED) e li assegna al
-- worker con un lease di p_lease_seconds. Ogni prelievo conta un tentativo.
create function public.claim_agent_jobs(
  p_worker_id text, p_limit integer default 1, p_lease_seconds integer default 300,
  p_types text[] default null, p_run_id bigint default null
) returns setof public.agent_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  if p_worker_id is null or char_length(p_worker_id) not between 1 and 200 then
    raise exception 'worker_id non valido' using errcode = '22023';
  end if;
  if p_limit not between 1 and 50 or p_lease_seconds not between 10 and 3600 then
    raise exception 'Parametri di prelievo non validi (limit 1–50, lease 10–3600 s)' using errcode = '22023';
  end if;
  perform public.recover_expired_agent_jobs();
  return query
  with ready as (
    select j.id
    from public.agent_jobs j
    where j.status in ('queued', 'failed')
      and j.next_run_at <= now()
      and (p_types is null or j.type = any (p_types))
    order by j.next_run_at, j.id
    limit p_limit
    for update skip locked
  )
  update public.agent_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => p_lease_seconds),
      started_at = now(),
      last_run_id = coalesce(p_run_id, j.last_run_id)
  from ready
  where j.id = ready.id
  returning j.*;
end;
$$;

-- Prolunga il lease di un job ancora posseduto dal worker (job lunghi).
create function public.extend_agent_job_lease(p_job_id bigint, p_worker_id text, p_lease_seconds integer default 300)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if p_lease_seconds not between 10 and 3600 then
    raise exception 'Lease non valido (10–3600 s)' using errcode = '22023';
  end if;
  update public.agent_jobs
  set locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_job_id and status = 'running' and locked_by = p_worker_id and locked_until >= now()
  returning locked_until into v_until;
  if v_until is null then
    raise exception 'Il worker % non possiede il job % (lease perso)', p_worker_id, p_job_id
      using errcode = '55000';
  end if;
  return v_until;
end;
$$;

-- Completa un job. Solo il worker che possiede il lease può farlo.
create function public.complete_agent_job(p_job_id bigint, p_worker_id text, p_result jsonb default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.agent_jobs
  set status = 'done', locked_by = null, locked_until = null, finished_at = now(),
      last_error = null, result = p_result
  where id = p_job_id and status = 'running' and locked_by = p_worker_id;
  if not found then
    raise exception 'Il worker % non possiede il job % (lease perso)', p_worker_id, p_job_id
      using errcode = '55000';
  end if;
end;
$$;

-- Registra un fallimento: rimanda con backoff esponenziale e jitter, oppure
-- passa a `dead` se i tentativi sono esauriti o l'errore non è recuperabile.
-- Restituisce il nuovo stato.
create function public.fail_agent_job(
  p_job_id bigint, p_worker_id text, p_error text, p_retryable boolean default true
) returns public.agent_job_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.agent_jobs;
begin
  select * into v_job from public.agent_jobs
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  for update;
  if not found then
    raise exception 'Il worker % non possiede il job % (lease perso)', p_worker_id, p_job_id
      using errcode = '55000';
  end if;
  if not coalesce(p_retryable, true) or v_job.attempts >= v_job.max_attempts then
    update public.agent_jobs
    set status = 'dead', locked_by = null, locked_until = null, finished_at = now(),
        last_error = left(coalesce(p_error, 'Errore non specificato'), 2000)
    where id = p_job_id;
    perform app_private.notify_agent_monitors(
      'agent.job_dead', 'error', format('Job %s in dead-letter', v_job.type),
      left(coalesce(p_error, 'Errore non specificato'), 2000), '/admin/agent',
      format('agent.job_dead:%s:%s', p_job_id, v_job.attempts), p_job_id);
    return 'dead';
  end if;
  update public.agent_jobs
  set status = 'failed', locked_by = null, locked_until = null,
      next_run_at = now() + app_private.agent_backoff(v_job.attempts),
      last_error = left(coalesce(p_error, 'Errore non specificato'), 2000)
  where id = p_job_id;
  return 'failed';
end;
$$;

-- Consuma p_cost unità del budget di un provider nella finestra corrente (UTC).
-- Restituisce false, senza consumare nulla, se il budget sarebbe superato.
create function public.consume_agent_quota(
  p_provider text, p_window public.agent_quota_window, p_quota integer, p_cost integer default 1
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc(p_window::text, now() at time zone 'UTC') at time zone 'UTC';
  v_used integer;
begin
  if p_quota is null or p_quota < 1 or p_cost is null or p_cost < 1 then
    raise exception 'Parametri di quota non validi' using errcode = '22023';
  end if;
  if p_cost > p_quota then
    return false;
  end if;
  insert into public.agent_rate_limits as rl (provider, window_kind, window_start, used, quota)
  values (p_provider, p_window, v_start, p_cost, p_quota)
  on conflict (provider, window_kind, window_start) do update
    set used = rl.used + excluded.used, quota = excluded.quota, updated_at = now()
    where rl.used + excluded.used <= excluded.quota
  returning used into v_used;
  return v_used is not null;
end;
$$;

-- Notifica un utente (dashboard). Con dedupe_key non duplica.
create function public.notify_user(
  p_user_id uuid, p_kind text, p_title text, p_body text default null,
  p_severity public.notification_severity default 'info', p_link text default null,
  p_dedupe_key text default null
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
  values (p_user_id, p_kind, coalesce(p_severity, 'info'), p_title, p_body, p_link, p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ripresa manuale di un job `dead` (agents.monitor con 2FA, registrata nell'audit)
-- -----------------------------------------------------------------------------
create function public.retry_dead_agent_job(p_job_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.agent_jobs;
begin
  -- assert_admin_session: utente attivo, ADMIN o SUPER_ADMIN (= agents.monitor), aal2.
  perform app_private.assert_admin_session();
  if not app_private.can_monitor_agents() then
    raise exception 'Permessi insufficienti' using errcode = '42501';
  end if;
  select * into v_job from public.agent_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job % inesistente', p_job_id using errcode = 'P0002';
  end if;
  if v_job.status <> 'dead' then
    raise exception 'Il job % non è in dead-letter (stato %)', p_job_id, v_job.status
      using errcode = '55000';
  end if;
  update public.agent_jobs
  set status = 'queued', attempts = 0, next_run_at = now(), finished_at = null
  where id = p_job_id;
  perform app_private.audit('agent.job_retried', 'agent_job', p_job_id::text,
    jsonb_build_object('type', v_job.type, 'attempts', v_job.attempts, 'last_error', v_job.last_error));
end;
$$;

-- -----------------------------------------------------------------------------
-- Viste per l'interfaccia (corsia B)
-- -----------------------------------------------------------------------------

-- Stato dell'agente per sorgente. Cadenza attesa e soglia di "degradato" da
-- ADR 0035; si cambiano con una nuova migrazione.
create view public.v_agent_status
with (security_invoker = true) as
with expected (source, expected_interval_minutes, degraded_after_minutes) as (
  values ('qstash'::public.agent_run_source, 15, 45),
         ('github_actions'::public.agent_run_source, 180, 360)
),
recent as (
  select r.source,
         count(*) as runs_24h,
         count(*) filter (where r.status = 'failed') as failed_runs_24h,
         min(r.started_at) as first_started,
         max(r.started_at) as last_started
  from public.agent_runs r
  where r.started_at >= now() - interval '24 hours'
  group by r.source
)
select
  e.source,
  e.expected_interval_minutes,
  e.degraded_after_minutes,
  last_run.started_at as last_run_at,
  last_run.status as last_run_status,
  last_ok.finished_at as last_success_at,
  coalesce(rc.runs_24h, 0)::integer as runs_24h,
  coalesce(rc.failed_runs_24h, 0)::integer as failed_runs_24h,
  case when rc.runs_24h > 1
       then round((extract(epoch from rc.last_started - rc.first_started) / 60 / (rc.runs_24h - 1))::numeric, 1)
  end as observed_interval_minutes,
  (last_ok.finished_at is null
   or last_ok.finished_at < now() - make_interval(mins => e.degraded_after_minutes)) as is_degraded
from expected e
left join recent rc on rc.source = e.source
left join lateral (
  select r.started_at, r.status from public.agent_runs r
  where r.source = e.source order by r.started_at desc, r.id desc limit 1
) last_run on true
left join lateral (
  select r.finished_at from public.agent_runs r
  where r.source = e.source and r.status in ('succeeded', 'partial')
  order by r.finished_at desc, r.id desc limit 1
) last_ok on true;

-- Riepilogo delle code per tipo e stato.
create view public.v_agent_queue_summary
with (security_invoker = true) as
select
  j.type,
  j.status,
  count(*)::integer as jobs,
  count(*) filter (where j.status in ('queued', 'failed') and j.next_run_at <= now())::integer as ready,
  count(*) filter (where j.status = 'running' and j.locked_until < now())::integer as lease_expired,
  min(j.next_run_at) filter (where j.status in ('queued', 'failed')) as next_run_at,
  max(j.updated_at) as last_change_at
from public.agent_jobs j
group by j.type, j.status;

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table public.agent_jobs        enable row level security;
alter table public.agent_runs        enable row level security;
alter table public.agent_rate_limits enable row level security;
alter table public.notifications     enable row level security;

revoke all on
  public.agent_jobs, public.agent_runs, public.agent_rate_limits, public.notifications,
  public.v_agent_status, public.v_agent_queue_summary
from public, anon, authenticated, service_role;

grant select on
  public.agent_jobs, public.agent_runs, public.agent_rate_limits,
  public.v_agent_status, public.v_agent_queue_summary
to authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy agent_jobs_monitor on public.agent_jobs for select to authenticated
  using (app_private.can_monitor_agents());
create policy agent_runs_monitor on public.agent_runs for select to authenticated
  using (app_private.can_monitor_agents());
create policy agent_rate_limits_monitor on public.agent_rate_limits for select to authenticated
  using (app_private.can_monitor_agents());

-- Notifiche: SOLO il proprietario. Nessuna policy per admin o Super Admin.
create policy notifications_owner_read on public.notifications for select to authenticated
  using (user_id = auth.uid() and app_private.is_active_user());
create policy notifications_owner_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid());

revoke execute on function app_private.can_monitor_agents() from public, anon;
grant execute on function app_private.can_monitor_agents() to authenticated, service_role;
revoke execute on function app_private.agent_backoff(integer) from public, anon, authenticated;
revoke execute on function app_private.check_notification_update() from public, anon;
revoke execute on function
  app_private.notify_agent_monitors(text, public.notification_severity, text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function app_private.agent_backoff(integer) to service_role;

revoke execute on function public.start_agent_run(public.agent_run_source, text, text) from public, anon, authenticated;
revoke execute on function public.finish_agent_run(bigint, public.agent_run_status, integer, integer, integer, text)
  from public, anon, authenticated;
revoke execute on function public.enqueue_agent_job(text, text, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.recover_expired_agent_jobs() from public, anon, authenticated;
revoke execute on function public.claim_agent_jobs(text, integer, integer, text[], bigint) from public, anon, authenticated;
revoke execute on function public.extend_agent_job_lease(bigint, text, integer) from public, anon, authenticated;
revoke execute on function public.complete_agent_job(bigint, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_agent_job(bigint, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.consume_agent_quota(text, public.agent_quota_window, integer, integer)
  from public, anon, authenticated;
revoke execute on function
  public.notify_user(uuid, text, text, text, public.notification_severity, text, text)
  from public, anon, authenticated;
revoke execute on function public.retry_dead_agent_job(bigint) from public, anon, service_role;

grant execute on function public.start_agent_run(public.agent_run_source, text, text) to service_role;
grant execute on function public.finish_agent_run(bigint, public.agent_run_status, integer, integer, integer, text)
  to service_role;
grant execute on function public.enqueue_agent_job(text, text, jsonb, timestamptz, integer) to service_role;
grant execute on function public.recover_expired_agent_jobs() to service_role;
grant execute on function public.claim_agent_jobs(text, integer, integer, text[], bigint) to service_role;
grant execute on function public.extend_agent_job_lease(bigint, text, integer) to service_role;
grant execute on function public.complete_agent_job(bigint, text, jsonb) to service_role;
grant execute on function public.fail_agent_job(bigint, text, text, boolean) to service_role;
grant execute on function public.consume_agent_quota(text, public.agent_quota_window, integer, integer)
  to service_role;
grant execute on function
  public.notify_user(uuid, text, text, text, public.notification_severity, text, text)
  to service_role;
grant execute on function public.retry_dead_agent_job(bigint) to authenticated;
