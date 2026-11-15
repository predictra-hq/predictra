-- =============================================================================
-- M4 corsia 0 — attivazione reversibile del modello (ADR 0024, aggiornamento)
-- =============================================================================
-- Problema (DEV, 12/11/2026): attivando a mano Dixon-Coles, Poisson diventava
-- RETIRED. Le versioni ritirate non hanno il pulsante "Attiva" e il motore ritira
-- solo, non riporta in gara: Poisson spariva dai modelli in gara e non si poteva
-- più riattivare a mano.
--
-- Ora, sia nell'attivazione manuale (set_active_model_version) sia in quella
-- automatica (auto_activate_model_version), il modello sostituito torna CANDIDATE
-- (lo sfidante). RETIRED resta solo per le versioni superate, decise dal motore con
-- retire_superseded_model_versions (codice vecchio o famiglie non più in gara).
--
-- Ripristino una tantum: per Poisson e Dixon-Coles l'ultima versione registrata (il
-- codice corrente, ADR 0023) torna CANDIDATE se era stata ritirata da un cambio di
-- modello attivo.
-- =============================================================================

create or replace function public.set_active_model_version(p_model_version_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous bigint;
begin
  perform app_private.assert_admin_session();
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

create or replace function public.auto_activate_model_version(p_model_version_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous bigint;
begin
  if not exists (select 1 from public.model_versions where id = p_model_version_id) then
    raise exception 'Versione di modello % inesistente', p_model_version_id using errcode = '23503';
  end if;
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
  set status = 'ACTIVE', activated_at = now(), activated_by = null, retired_at = null
  where id = p_model_version_id;

  perform app_private.audit('model.auto_activated', 'model_version', p_model_version_id::text,
                            jsonb_build_object('previous', v_previous,
                                               'reason', left(coalesce(p_reason, ''), 500)));
end;
$$;

update public.model_versions mv
set status = 'CANDIDATE', retired_at = null
where mv.status = 'RETIRED'
  and mv.id in (
    select max(id) from public.model_versions
    where model_key in ('poisson', 'dixon_coles')
    group by model_key
  );
