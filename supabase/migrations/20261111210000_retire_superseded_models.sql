-- =============================================================================
-- M4 corsia 0 — un modello PREDICTRA e uno sfidante (ADR 0024)
-- =============================================================================
-- In gara restano solo Poisson e Dixon-Coles della versione corrente del codice.
-- Baseline ed Elo diventano strumenti interni del motore (riferimento del backtest e
-- secondo parere del Confidence Score) e non si registrano più. Le versioni superate
-- si ritirano: restano nel database per la riproducibilità (ADR 0020), ma non sono
-- più modelli "in elenco".
--
-- retire_superseded_model_versions(keep): le versioni CANDIDATE fuori da `keep`
-- diventano RETIRED. Non tocca la versione ACTIVE (la cambia solo l'attivazione).
-- Solo service_role (il motore). Una voce di audit per ogni chiamata che ritira.
-- =============================================================================

create function public.retire_superseded_model_versions(p_keep bigint[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.model_versions
  set status = 'RETIRED', retired_at = now()
  where status = 'CANDIDATE' and not (id = any(coalesce(p_keep, '{}'::bigint[])));
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform app_private.audit('model.versions_retired', 'model_version', null,
                              jsonb_build_object('count', v_count, 'kept', to_jsonb(p_keep)));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.retire_superseded_model_versions(bigint[]) from public, anon, authenticated;
grant execute on function public.retire_superseded_model_versions(bigint[]) to service_role;
