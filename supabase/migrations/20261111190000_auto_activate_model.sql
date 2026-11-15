-- =============================================================================
-- M4 corsia 0 — attivazione automatica del modello più forte (ADR 0023)
-- =============================================================================
-- Il motore (chiave secret, service_role) attiva da solo la versione con il Log Loss
-- migliore tra quelle del codice corrente che battono la baseline. Stesse garanzie
-- dell'attivazione manuale (set_active_model_version):
--   - la versione deve avere un backtest migliore della baseline su Brier e Log Loss
--     (ADR 0021 §4);
--   - al più una versione attiva; la precedente diventa RETIRED;
--   - ogni cambio è registrato in audit ('model.auto_activated', con il motivo).
-- La scelta di quale versione attivare la fa il motore (selection.py); il database
-- ricontrolla solo le condizioni minime. L'attivazione manuale di un Super Admin con
-- 2FA resta possibile; il motore la cambia solo se trova un modello più forte.
-- =============================================================================

create function public.auto_activate_model_version(p_model_version_id bigint, p_reason text)
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
  update public.model_versions
  set status = 'RETIRED', retired_at = now()
  where id = v_previous;
  update public.model_versions
  set status = 'ACTIVE', activated_at = now(), activated_by = null, retired_at = null
  where id = p_model_version_id;

  perform app_private.audit('model.auto_activated', 'model_version', p_model_version_id::text,
                            jsonb_build_object('previous', v_previous,
                                               'reason', left(coalesce(p_reason, ''), 500)));
end;
$$;

revoke execute on function public.auto_activate_model_version(bigint, text) from public, anon, authenticated;
grant execute on function public.auto_activate_model_version(bigint, text) to service_role;
