-- =============================================================================
-- PREDICTRA — M8: Ask PREDICTRA, quota giornaliera per utente
-- =============================================================================
-- Decisione: docs/decisions/0042-ask-predictra.md
-- Dizionario: docs/data-dictionary/ask.md
--
-- Principi:
--  * si salvano solo contatori (domande, token, risposte scartate): MAI il testo
--    delle domande o delle risposte;
--  * RLS solo proprietario: ogni utente vede soltanto il proprio uso;
--  * la quota si consuma solo tramite RPC: il limite è nel database, non nel client.
-- =============================================================================

create table public.ask_usage (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Giorno in UTC: la quota si azzera a mezzanotte UTC.
  day        date not null,
  questions  integer not null default 0 check (questions >= 0),
  tokens     integer not null default 0 check (tokens >= 0),
  -- Risposte scartate dal controllo sui numeri (ADR 0042 §2).
  rejected   integer not null default 0 check (rejected >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ask_usage enable row level security;
revoke all on public.ask_usage from public, anon, authenticated;
grant select on public.ask_usage to authenticated;

create policy ask_usage_owner on public.ask_usage for select to authenticated
  using (user_id = auth.uid() and app_private.is_active_user());

-- Limite giornaliero (specchiato in packages/shared-types/src/ask.ts).
create function app_private.ask_daily_limit()
returns integer
language sql immutable set search_path = ''
as $$ select 30 $$;

-- Consuma una domanda della quota di oggi. Restituisce le domande rimaste;
-- errore 'ASK_QUOTA_EXCEEDED' (P0001) se la quota è finita.
create function public.ask_consume()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_used integer;
  v_limit integer := app_private.ask_daily_limit();
begin
  if auth.uid() is null or not app_private.is_active_user() then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  insert into public.ask_usage as u (user_id, day, questions)
  values (auth.uid(), (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set questions = u.questions + 1, updated_at = now()
    where u.questions < v_limit
  returning questions into v_used;
  if v_used is null then
    raise exception 'ASK_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  return v_limit - v_used;
end;
$$;

-- Registra i token usati e l'esito del controllo sui numeri per la domanda appena fatta.
create function public.ask_record(p_tokens integer, p_rejected boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not app_private.is_active_user() then
    raise exception 'Utente non attivo' using errcode = '42501';
  end if;
  if p_tokens is null or p_tokens < 0 or p_tokens > 1000000 then
    raise exception 'Token non validi' using errcode = '22023';
  end if;
  update public.ask_usage
    set tokens = tokens + p_tokens,
        rejected = rejected + case when p_rejected then 1 else 0 end,
        updated_at = now()
  where user_id = auth.uid() and day = (now() at time zone 'utc')::date;
end;
$$;

revoke execute on function app_private.ask_daily_limit() from public, anon, authenticated;
revoke execute on function public.ask_consume() from public, anon;
grant execute on function public.ask_consume() to authenticated;
revoke execute on function public.ask_record(integer, boolean) from public, anon;
grant execute on function public.ask_record(integer, boolean) to authenticated;
