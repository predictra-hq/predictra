-- Step-up 2FA per le azioni distruttive (ADR 0077, M8).
--
-- Le azioni amministrative richiedevano già una sessione aal2, che però dura quanto la
-- sessione: chi trova un computer lasciato aperto può sospendere utenti, cambiare ruoli,
-- generare link di reset o cambiare il modello attivo. Ora queste quattro azioni chiedono
-- anche un codice TOTP verificato negli ultimi 5 minuti.
--
-- Il JWT di Supabase porta in `amr` i metodi di accesso con il momento dell'ultima verifica
-- ({"method": "totp", "timestamp": <secondi>}). Una nuova verifica del codice su una
-- sessione aal2 (mfa.challengeAndVerify) aggiorna quel momento. Non si usa `iat`, che
-- cambia a ogni rinnovo del token.
--
-- Le funzioni sono ridefinite con lo stesso corpo di prima e una riga in più dopo
-- assert_admin_session (le migrazioni già applicate non si modificano). Privilegi invariati.

create function app_private.assert_recent_mfa(p_max_age interval default interval '5 minutes')
returns void
language plpgsql stable set search_path = ''
as $$
declare
  v_amr jsonb := auth.jwt() -> 'amr';
  v_last double precision;
begin
  if jsonb_typeof(v_amr) = 'array' then
    select max((e ->> 'timestamp')::double precision) into v_last
    from jsonb_array_elements(v_amr) as e
    where e ->> 'method' = 'totp' and jsonb_typeof(e -> 'timestamp') = 'number';
  end if;
  if v_last is null or to_timestamp(v_last) < now() - p_max_age then
    raise exception 'Per questa azione conferma con il codice dell''app di autenticazione (vale 5 minuti)'
      using errcode = '42501', hint = 'STEP_UP_REQUIRED';
  end if;
end;
$$;

revoke all on function app_private.assert_recent_mfa(interval) from public, anon, authenticated;

create or replace function public.set_account_status(p_user_id uuid, p_status public.account_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_current public.account_status;
begin
  perform app_private.assert_admin_session();
  -- Step-up (ADR 0077): un codice TOTP inserito negli ultimi 5 minuti.
  perform app_private.assert_recent_mfa();

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

create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.app_role[];
begin
  perform app_private.assert_admin_session();
  -- Step-up (ADR 0077): un codice TOTP inserito negli ultimi 5 minuti.
  perform app_private.assert_recent_mfa();

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

create or replace function public.authorize_password_reset(p_user_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  perform app_private.assert_admin_session();
  -- Step-up (ADR 0077): un codice TOTP inserito negli ultimi 5 minuti.
  perform app_private.assert_recent_mfa();

  if p_user_id = auth.uid() then
    raise exception 'Per la tua password usa Impostazioni → Sicurezza' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  if not app_private.has_role('SUPER_ADMIN')
     and app_private.max_rank(p_user_id) >= app_private.max_rank(auth.uid()) then
    raise exception 'Permessi insufficienti su questo account' using errcode = '42501';
  end if;

  perform app_private.audit('user.password_reset_link', 'user', p_user_id::text, '{}'::jsonb);
  return v_email;
end;
$$;

create or replace function public.set_active_model_version(p_model_version_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous bigint;
begin
  perform app_private.assert_admin_session();
  -- Step-up (ADR 0077): un codice TOTP inserito negli ultimi 5 minuti.
  perform app_private.assert_recent_mfa();
  -- models.manage spetta solo a SUPER_ADMIN (packages/shared-types/src/roles.ts).
  if not app_private.has_role('SUPER_ADMIN') then
    raise exception 'Permessi insufficienti' using errcode = '42501';
  end if;
  if not exists (select 1 from public.model_versions where id = p_model_version_id) then
    raise exception 'Versione di modello % inesistente', p_model_version_id using errcode = '23503';
  end if;
  -- ADR 0021 §4: serve un backtest migliore della baseline su Brier e Log Loss.
  if not exists (
    select 1 from public.backtests b
    where b.model_version_id = p_model_version_id
      and b.baseline_brier is not null
      and b.brier < b.baseline_brier
      and b.log_loss < b.baseline_log_loss
  ) then
    raise exception 'Nessun backtest migliore della baseline per la versione %', p_model_version_id
      using errcode = '23514';
  end if;

  select id into v_previous from public.model_versions where status = 'ACTIVE';
  if v_previous = p_model_version_id then
    return;
  end if;
  -- Il modello sostituito torna sfidante, non ritirato: si può riattivare.
  update public.model_versions
  set status = 'CANDIDATE', retired_at = null
  where id = v_previous;
  update public.model_versions
  set status = 'ACTIVE', activated_at = now(), activated_by = auth.uid(), retired_at = null
  where id = p_model_version_id;

  perform app_private.audit('model.activated', 'model_version', p_model_version_id::text,
                            jsonb_build_object('previous', v_previous));
end;
$$;
