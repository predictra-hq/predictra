-- =============================================================================
-- PREDICTRA — Migrazione 0001: identità, ruoli, inviti, preferenze, audit
-- =============================================================================
-- Principi:
--  * RLS attiva su tutte le tabelle; nessun accesso per il ruolo `anon`.
--  * Le scritture sensibili (ruoli, stato account, inviti) passano SOLO da
--    funzioni SECURITY DEFINER che ricontrollano permessi, stato e AAL (2FA).
--  * Le funzioni helper vivono nello schema `app_private`, non esposto dalla API.
--  * Gli amministratori NON hanno accesso ai dati personali altrui
--    (preferenze, in futuro bankroll/puntate).
--  * audit_logs è append-only.
-- =============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('SUPER_ADMIN', 'ADMIN', 'USER');
create type public.account_status as enum ('ACTIVE', 'SUSPENDED');
create type public.invitation_status as enum ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------

-- Catalogo ruoli (descrittivo; i valori ammessi sono vincolati dall'enum).
create table public.roles (
  code        public.app_role primary key,
  rank        smallint not null unique check (rank > 0),
  description text not null
);

insert into public.roles (code, rank, description) values
  ('USER',        1, 'Uso delle funzionalità e gestione del proprio profilo/bankroll'),
  ('ADMIN',       2, 'Gestione utenti e inviti nei limiti assegnati'),
  ('SUPER_ADMIN', 3, 'Amministrazione completa; più Super Admin hanno pari privilegi');

-- Profilo applicativo, 1:1 con auth.users.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  status        public.account_status not null default 'ACTIVE',
  suspended_at  timestamptz,
  suspended_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_suspension_consistency
    check ((status = 'SUSPENDED') = (suspended_at is not null))
);
create unique index profiles_email_lower_key on public.profiles (lower(email));

-- Ruoli assegnati. Un utente può averne più d'uno; in pratica uno.
create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null references public.roles (code),
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

-- Inviti. Nessuna registrazione pubblica: si entra solo da invito.
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role          public.app_role not null references public.roles (code),
  status        public.invitation_status not null default 'PENDING',
  invited_by    uuid references public.profiles (id) on delete set null,   -- null = bootstrap
  auth_user_id  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  sent_at       timestamptz,
  send_error    text,
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  constraint invitations_expiry_after_creation check (expires_at > created_at)
);
-- Al più un invito PENDING per email.
create unique index invitations_one_pending_per_email
  on public.invitations (lower(email)) where status = 'PENDING';
create index invitations_status_created_idx on public.invitations (status, created_at desc);
create index invitations_invited_by_created_idx on public.invitations (invited_by, created_at desc);

-- Preferenze personali (private: visibili solo al proprietario).
create table public.user_preferences (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  locale       text not null default 'it' check (locale in ('it')),
  timezone     text not null default 'Europe/Rome' check (char_length(timezone) between 1 and 64),
  odds_format  text not null default 'decimal' check (odds_format in ('decimal')),
  updated_at   timestamptz not null default now()
);

-- Impostazioni dashboard personali (layout, filtri salvati).
create table public.user_dashboard_settings (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at  timestamptz not null default now()
);

-- Audit append-only delle azioni critiche.
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (char_length(action) between 1 and 100),
  target_type  text,
  target_id    text,
  metadata     jsonb not null default '{}'::jsonb
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

-- Contatori di rate limiting (login, recupero password, inviti). Solo service_role.
create table app_private.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- -----------------------------------------------------------------------------
-- Helper (app_private): leggono lo stato dell'utente corrente
-- -----------------------------------------------------------------------------

create function app_private.current_roles()
returns public.app_role[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(ur.role), '{}')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid() and p.status = 'ACTIVE';
$$;

create function app_private.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid() and p.status = 'ACTIVE'
  );
$$;

create function app_private.has_role(p_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_role = any (app_private.current_roles());
$$;

create function app_private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app_private.has_role('SUPER_ADMIN') or app_private.has_role('ADMIN');
$$;

create function app_private.max_rank(p_user uuid)
returns smallint
language sql stable security definer set search_path = ''
as $$
  select coalesce(max(r.rank), 0)::smallint
  from public.user_roles ur join public.roles r on r.code = ur.role
  where ur.user_id = p_user;
$$;

-- La sessione corrente ha completato la 2FA (Authenticator Assurance Level 2)?
create function app_private.is_aal2()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create function app_private.audit(
  p_action text, p_target_type text, p_target_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Verifica permessi amministrativi per le RPC: utente attivo, admin, sessione 2FA.
create function app_private.assert_admin_session()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;
  if not app_private.is_active_user() or not app_private.is_admin() then
    raise exception 'Permessi insufficienti' using errcode = '42501';
  end if;
  if not app_private.is_aal2() then
    raise exception 'Verifica a due fattori richiesta per le azioni amministrative'
      using errcode = '42501', hint = 'MFA_REQUIRED';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------

-- Crea il profilo alla creazione dell'utente auth (anche via invito).
create function app_private.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  insert into public.user_dashboard_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_auth_user();

create function app_private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function app_private.touch_updated_at();
create trigger user_dashboard_settings_touch before update on public.user_dashboard_settings
  for each row execute function app_private.touch_updated_at();

-- audit_logs: append-only, anche per i ruoli privilegiati diversi dal superuser.
create function app_private.forbid_audit_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_logs è append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app_private.forbid_audit_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app_private.forbid_audit_mutation();

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------

alter table public.roles                   enable row level security;
alter table public.profiles                enable row level security;
alter table public.user_roles              enable row level security;
alter table public.invitations             enable row level security;
alter table public.user_preferences        enable row level security;
alter table public.user_dashboard_settings enable row level security;
alter table public.audit_logs              enable row level security;
alter table app_private.rate_limits        enable row level security;

-- Nessun privilegio implicito: si concede solo ciò che serve.
revoke all on public.roles, public.profiles, public.user_roles, public.invitations,
  public.user_preferences, public.user_dashboard_settings, public.audit_logs
  from anon, authenticated;
revoke all on app_private.rate_limits from public, anon, authenticated;

grant select on public.roles to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.invitations to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.user_dashboard_settings to authenticated;
grant select on public.audit_logs to authenticated;
grant all on app_private.rate_limits to service_role;

-- roles: catalogo leggibile dagli utenti attivi.
create policy roles_select on public.roles for select to authenticated
  using (app_private.is_active_user());

-- profiles: il proprio sempre (anche se sospeso, per mostrare lo stato);
-- tutti solo agli admin attivi.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated
  using (app_private.is_active_user() and app_private.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and app_private.is_active_user())
  with check (id = auth.uid());

-- user_roles
create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = auth.uid());
create policy user_roles_select_admin on public.user_roles for select to authenticated
  using (app_private.is_active_user() and app_private.is_admin());

-- invitations: solo admin attivi.
create policy invitations_select_admin on public.invitations for select to authenticated
  using (app_private.is_active_user() and app_private.is_admin());

-- preferenze e dashboard: SOLO il proprietario. Gli admin non hanno policy qui.
create policy user_preferences_owner on public.user_preferences for all to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid());
create policy user_dashboard_settings_owner on public.user_dashboard_settings for all to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid());

-- audit: lettura solo Super Admin attivi; nessuna scrittura diretta.
create policy audit_logs_select_super_admin on public.audit_logs for select to authenticated
  using (app_private.is_active_user() and app_private.has_role('SUPER_ADMIN'));

-- -----------------------------------------------------------------------------
-- RPC (public, SECURITY DEFINER, controlli espliciti)
-- -----------------------------------------------------------------------------

-- Crea un invito. L'invio dell'email avviene lato server (Supabase Auth Admin API)
-- solo DOPO che questa funzione ha validato i permessi.
create function public.create_invitation(p_email text, p_role public.app_role)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_recent integer;
begin
  perform app_private.assert_admin_session();

  -- Super Admin: qualsiasi ruolo (pari privilegi). Admin: solo ruoli inferiori.
  if not app_private.has_role('SUPER_ADMIN')
     and (select rank from public.roles where code = p_role) >= app_private.max_rank(auth.uid()) then
    raise exception 'Non puoi invitare utenti con il ruolo %', p_role using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
    where lower(p.email) = v_email
  ) then
    raise exception 'Esiste già un account attivo per questa email' using errcode = '23505';
  end if;

  -- Rate limit: max 20 inviti/ora per amministratore.
  select count(*) into v_recent from public.invitations
  where invited_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'Troppi inviti nell''ultima ora, riprova più tardi' using errcode = '54000';
  end if;

  -- Gli inviti PENDING scaduti vengono chiusi prima di crearne uno nuovo.
  update public.invitations set status = 'EXPIRED'
  where lower(email) = v_email and status = 'PENDING' and expires_at <= now();

  insert into public.invitations (email, role, invited_by)
  values (v_email, p_role, auth.uid())
  returning id into v_id;

  perform app_private.audit('invitation.created', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

-- Revoca un invito PENDING. Restituisce l'eventuale auth_user_id da eliminare
-- lato server (utente creato dall'invito e mai attivato).
create function public.revoke_invitation(p_invitation_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  perform app_private.assert_admin_session();

  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'Solo gli inviti in attesa possono essere revocati' using errcode = '22023';
  end if;
  if not app_private.has_role('SUPER_ADMIN')
     and (select rank from public.roles where code = v_inv.role) >= app_private.max_rank(auth.uid()) then
    raise exception 'Permessi insufficienti per questo invito' using errcode = '42501';
  end if;

  update public.invitations
  set status = 'REVOKED', revoked_at = now(), revoked_by = auth.uid()
  where id = p_invitation_id;

  perform app_private.audit('invitation.revoked', 'invitation', p_invitation_id::text,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
  return v_inv.auth_user_id;
end;
$$;

-- Accettazione: l'utente autenticato (dal link d'invito) riscatta l'invito
-- PENDING associato alla propria email e riceve il ruolo.
create function public.accept_invitation()
returns public.app_role
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations%rowtype;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  select * into v_inv from public.invitations
  where lower(email) = v_email and status = 'PENDING'
  order by created_at desc limit 1
  for update;

  if not found then
    raise exception 'Nessun invito valido per questo account' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'EXPIRED' where id = v_inv.id;
    raise exception 'Invito scaduto: chiedi un nuovo invito' using errcode = '22023';
  end if;
  if (select status from public.profiles where id = auth.uid()) <> 'ACTIVE' then
    raise exception 'Account sospeso' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), v_inv.role, v_inv.invited_by)
  on conflict do nothing;

  update public.invitations
  set status = 'ACCEPTED', accepted_at = now(), auth_user_id = auth.uid()
  where id = v_inv.id;

  perform app_private.audit('invitation.accepted', 'invitation', v_inv.id::text,
    jsonb_build_object('role', v_inv.role));
  return v_inv.role;
end;
$$;

-- Sospende o riattiva un account. Il blocco delle sessioni (ban) è applicato
-- lato server tramite Auth Admin API subito dopo.
create function public.set_account_status(p_user_id uuid, p_status public.account_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_current public.account_status;
begin
  perform app_private.assert_admin_session();

  if p_user_id = auth.uid() then
    raise exception 'Non puoi modificare lo stato del tuo account' using errcode = '42501';
  end if;
  select status into v_current from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  if not app_private.has_role('SUPER_ADMIN')
     and app_private.max_rank(p_user_id) >= app_private.max_rank(auth.uid()) then
    raise exception 'Permessi insufficienti su questo account' using errcode = '42501';
  end if;
  if v_current = p_status then
    return;
  end if;

  update public.profiles
  set status = p_status,
      suspended_at = case when p_status = 'SUSPENDED' then now() else null end,
      suspended_by = case when p_status = 'SUSPENDED' then auth.uid() else null end
  where id = p_user_id;

  perform app_private.audit(
    case when p_status = 'SUSPENDED' then 'account.suspended' else 'account.reactivated' end,
    'user', p_user_id::text, '{}'::jsonb);
end;
$$;

-- Imposta il ruolo (unico) di un utente.
create function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.app_role[];
begin
  perform app_private.assert_admin_session();

  if p_user_id = auth.uid() then
    raise exception 'Non puoi modificare il tuo ruolo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  if not app_private.has_role('SUPER_ADMIN') then
    if app_private.max_rank(p_user_id) >= app_private.max_rank(auth.uid())
       or (select rank from public.roles where code = p_role) >= app_private.max_rank(auth.uid()) then
      raise exception 'Permessi insufficienti per questo ruolo' using errcode = '42501';
    end if;
  end if;

  select coalesce(array_agg(role), '{}') into v_old from public.user_roles where user_id = p_user_id;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid());

  -- Deve restare almeno un Super Admin attivo.
  if not exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.role = 'SUPER_ADMIN' and p.status = 'ACTIVE'
  ) then
    raise exception 'Deve restare almeno un Super Admin attivo' using errcode = '23514';
  end if;

  perform app_private.audit('user.role_changed', 'user', p_user_id::text,
    jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- Rate limiting a finestra fissa, usato lato server con la service role
-- (login, recupero password). Restituisce true se la richiesta è consentita.
create function public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_max < 1 or p_window_seconds < 1 or char_length(p_key) > 200 then
    raise exception 'Parametri rate limit non validi' using errcode = '22023';
  end if;
  insert into app_private.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  -- Pulizia opportunistica delle finestre vecchie.
  delete from app_private.rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_max;
end;
$$;

-- Le funzioni sono eseguibili solo da chi deve.
-- Agli utenti autenticati servono solo gli helper usati dentro le policy RLS;
-- audit e controlli di sessione sono invocati dalle RPC SECURITY DEFINER.
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.current_roles() to authenticated;
grant execute on function app_private.is_active_user() to authenticated;
grant execute on function app_private.has_role(public.app_role) to authenticated;
grant execute on function app_private.is_admin() to authenticated;
grant execute on all functions in schema app_private to service_role;

revoke execute on function public.create_invitation(text, public.app_role) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.accept_invitation() from public, anon;
revoke execute on function public.set_account_status(uuid, public.account_status) from public, anon;
revoke execute on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;

grant execute on function public.create_invitation(text, public.app_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation() to authenticated;
grant execute on function public.set_account_status(uuid, public.account_status) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
