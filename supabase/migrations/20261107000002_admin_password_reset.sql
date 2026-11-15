-- =============================================================================
-- PREDICTRA — Migrazione 0002: reset password generato da un amministratore
-- =============================================================================
-- La piattaforma non invia email. Il link di reimpostazione viene generato lato
-- server (Auth Admin API) e consegnato a mano dall'amministratore.
-- Questa RPC autorizza l'operazione (stessa gerarchia della sospensione),
-- registra l'audit e restituisce l'email del destinatario.
-- =============================================================================

create function public.authorize_password_reset(p_user_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  perform app_private.assert_admin_session();

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

revoke execute on function public.authorize_password_reset(uuid) from public, anon;
grant execute on function public.authorize_password_reset(uuid) to authenticated;
