-- =============================================================================
-- Conservazione delle previsioni: anche le versioni ritirate (ADR 0041, 17/11/2026)
-- =============================================================================
-- La prima regola (20261117120000) teneva l'ultima previsione di ogni VERSIONE del
-- modello. Ogni modifica al codice del modello crea una versione nuova e ritira la
-- precedente: le versioni ritirate si tenevano le loro previsioni per sempre, ed è lì il
-- grosso dello spazio. Prova su DEV del 17/11/2026: nessuna riga da cancellare.
--
-- Ora una previsione più vecchia di `p_keep_days` giorni e non usata da una schedina si
-- cancella se c'è una previsione più recente della stessa famiglia del modello (stesso
-- `model_key`, qualunque versione) per la stessa partita, mercato, linea ed esito, e
-- in più non è l'ultima della sua versione oppure la sua versione è ritirata.
-- Restano quindi sempre:
--   - l'ultima della famiglia (quella che usano Certezze e Affidabilità tramite
--     v_pre_kickoff_predictions);
--   - l'ultima di ogni versione in gara o attiva (quella che mostra v_active_predictions);
--   - le previsioni recenti e quelle usate da proposte e schedine.
-- =============================================================================

create or replace function public.prune_predictions(p_keep_days integer default 7, p_limit integer default 20000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_predictions integer := 0;
  v_matrices integer := 0;
begin
  if p_keep_days is null or p_keep_days < 1 or p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'Parametri non validi' using errcode = '22023';
  end if;
  v_cutoff := now() - make_interval(days => p_keep_days);
  perform set_config('predictra.pruning', 'on', true);

  with ranked as (
    select p.id, p.created_at, mv.status,
      -- ultima della stessa versione
      row_number() over (
        partition by p.match_id, p.model_version_id, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn_version,
      -- ultima della famiglia del modello, di qualunque versione (v_pre_kickoff_predictions)
      row_number() over (
        partition by p.match_id, mv.model_key, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn_family
    from public.predictions p
    join public.model_versions mv on mv.id = p.model_version_id
  ),
  doomed as (
    select r.id from ranked r
    where r.rn_family > 1
      and (r.rn_version > 1 or r.status = 'RETIRED')
      and r.created_at < v_cutoff
      and not exists (select 1 from public.bet_proposal_legs l where l.prediction_id = r.id)
      and not exists (select 1 from public.user_bet_slip_selections s where s.prediction_id = r.id)
    limit p_limit
  )
  delete from public.predictions p using doomed d where p.id = d.id;
  get diagnostics v_predictions = row_count;

  with ranked as (
    select m.id, m.created_at, mv.status,
      row_number() over (
        partition by m.match_id, m.model_version_id order by m.as_of desc, m.id desc
      ) as rn_version,
      row_number() over (
        partition by m.match_id, mv.model_key order by m.as_of desc, m.id desc
      ) as rn_family
    from public.prediction_score_matrices m
    join public.model_versions mv on mv.id = m.model_version_id
  ),
  doomed as (
    select r.id from ranked r
    where r.rn_family > 1 and (r.rn_version > 1 or r.status = 'RETIRED') and r.created_at < v_cutoff
    limit p_limit
  )
  delete from public.prediction_score_matrices m using doomed d where m.id = d.id;
  get diagnostics v_matrices = row_count;

  perform set_config('predictra.pruning', 'off', true);
  return jsonb_build_object('predictions', v_predictions, 'score_matrices', v_matrices);
end;
$$;

