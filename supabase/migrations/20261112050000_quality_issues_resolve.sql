-- ADR 0034 — Problemi di qualità che si chiudono da soli.
--
-- Il collector, dopo ogni lotto, indica le partite che non hanno più un problema di
-- punteggio (risultato mancante, supplementari senza risultato al 90', punteggio su una
-- partita non iniziata). I problemi aperti di quei controlli diventano RESOLVED.
-- Si chiudono solo problemi del provider dell'esecuzione e solo dei controlli indicati.

create function public.resolve_quality_issues(
  p_run_id bigint, p_check_codes text[], p_provider_entity_ids text[]
) returns integer
language plpgsql set search_path = ''
as $$
declare
  v_provider text;
  v_count    integer;
begin
  select provider into v_provider from public.ingestion_runs where id = p_run_id;
  if v_provider is null then
    raise exception 'Esecuzione % inesistente', p_run_id using errcode = 'P0002';
  end if;
  if coalesce(cardinality(p_provider_entity_ids), 0) > 5000 then
    raise exception 'Al massimo 5000 entità per chiamata' using errcode = '22023';
  end if;

  update public.data_quality_issues
  set status = 'RESOLVED', resolved_at = now(), ingestion_run_id = p_run_id
  where status = 'OPEN'
    and provider = v_provider
    and entity_type = 'match'
    and check_code = any (coalesce(p_check_codes, '{}'))
    and provider_entity_id = any (coalesce(p_provider_entity_ids, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.resolve_quality_issues(bigint, text[], text[])
  from public, anon, authenticated;
grant execute on function public.resolve_quality_issues(bigint, text[], text[]) to service_role;
