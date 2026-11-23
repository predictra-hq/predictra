-- Gli amministratori modificano il profilo pubblico di un utente (ADR 0067): nome
-- visualizzato, colore e scritta del nome, immagine. Stesse regole delle altre azioni
-- sugli utenti: sessione admin con 2FA, un ADMIN non tocca chi ha un ruolo pari o
-- superiore (il SUPER_ADMIN sì), ogni modifica finisce nel registro con i campi cambiati.
-- I vincoli della tabella (`profiles_*_check`) restano l'ultima difesa sui valori.
create function public.admin_update_profile(
  p_user_id uuid,
  p_display_name text,
  p_name_color text,
  p_name_style text,
  p_avatar_style text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.profiles%rowtype;
  v_name text := nullif(btrim(p_display_name), '');
  v_changed text[] := '{}';
begin
  perform app_private.assert_admin_session();

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  if p_user_id <> auth.uid()
     and not app_private.has_role('SUPER_ADMIN')
     and app_private.max_rank(p_user_id) >= app_private.max_rank(auth.uid()) then
    raise exception 'Permessi insufficienti su questo account' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Nome non valido' using errcode = '22023';
  end if;

  if v_old.display_name is distinct from v_name then v_changed := array_append(v_changed, 'display_name'); end if;
  if v_old.name_color is distinct from p_name_color then v_changed := array_append(v_changed, 'name_color'); end if;
  if v_old.name_style is distinct from p_name_style then v_changed := array_append(v_changed, 'name_style'); end if;
  if v_old.avatar_style is distinct from p_avatar_style then v_changed := array_append(v_changed, 'avatar_style'); end if;
  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.profiles
  set display_name = v_name,
      name_color = p_name_color,
      name_style = p_name_style,
      avatar_style = p_avatar_style
  where id = p_user_id;

  perform app_private.audit('profile.updated_by_admin', 'user', p_user_id::text,
    jsonb_build_object('fields', to_jsonb(v_changed)));
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, text, text)
  to authenticated;
