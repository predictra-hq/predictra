-- =============================================================================
-- Conservazione delle previsioni: solo ciò che l'app usa (ADR 0041, 17/11/2026)
-- =============================================================================
-- Prova su DEV del 17/11/2026 con la regola precedente (20261117140000): nessuna riga da
-- cancellare. Le previsioni più vecchie erano del modello Poisson, in gara fino al
-- 14/11/2026 e poi tolto: per la sua famiglia ogni previsione era «l'ultima» e restava.
--
-- L'app legge solo `v_active_predictions` (versione attiva) e `v_pre_kickoff_predictions`
-- (famiglia attiva). Una previsione più vecchia di `p_keep_days` giorni e non usata da una
-- schedina ora resta solo se è:
--   - l'ultima della sua versione, con la versione attiva o in gara;
--   - l'ultima della famiglia del modello attivo;
--   - l'ultima in assoluto per partita, mercato, linea ed esito (riserva: nessuna partita
--     resta senza previsioni).
-- Stesse regole per le matrici dei risultati esatti, per partita.
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
  v_active_key text;
begin
  if p_keep_days is null or p_keep_days < 1 or p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'Parametri non validi' using errcode = '22023';
  end if;
  v_cutoff := now() - make_interval(days => p_keep_days);
  select model_key into v_active_key from public.model_versions where status = 'ACTIVE';
  perform set_config('predictra.pruning', 'on', true);

  with ranked as (
    select p.id, p.created_at, mv.status, mv.model_key,
      -- ultima della stessa versione (v_active_predictions per la versione attiva)
      row_number() over (
        partition by p.match_id, p.model_version_id, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn_version,
      -- ultima della famiglia del modello (v_pre_kickoff_predictions per la famiglia attiva)
      row_number() over (
        partition by p.match_id, mv.model_key, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn_family,
      -- ultima in assoluto: almeno una previsione per partita resta sempre
      row_number() over (
        partition by p.match_id, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn_all
    from public.predictions p
    join public.model_versions mv on mv.id = p.model_version_id
  ),
  doomed as (
    select r.id from ranked r
    where r.created_at < v_cutoff
      and r.rn_all > 1
      and not (r.rn_version = 1 and r.status in ('ACTIVE', 'CANDIDATE'))
      and not (r.rn_family = 1 and r.model_key is not distinct from v_active_key)
      and not exists (select 1 from public.bet_proposal_legs l where l.prediction_id = r.id)
      and not exists (select 1 from public.user_bet_slip_selections s where s.prediction_id = r.id)
    limit p_limit
  )
  delete from public.predictions p using doomed d where p.id = d.id;
  get diagnostics v_predictions = row_count;

  with ranked as (
    select m.id, m.created_at, mv.status, mv.model_key,
      row_number() over (
        partition by m.match_id, m.model_version_id order by m.as_of desc, m.id desc
      ) as rn_version,
      row_number() over (
        partition by m.match_id, mv.model_key order by m.as_of desc, m.id desc
      ) as rn_family,
      row_number() over (partition by m.match_id order by m.as_of desc, m.id desc) as rn_all
    from public.prediction_score_matrices m
    join public.model_versions mv on mv.id = m.model_version_id
  ),
  doomed as (
    select r.id from ranked r
    where r.created_at < v_cutoff
      and r.rn_all > 1
      and not (r.rn_version = 1 and r.status in ('ACTIVE', 'CANDIDATE'))
      and not (r.rn_family = 1 and r.model_key is not distinct from v_active_key)
    limit p_limit
  )
  delete from public.prediction_score_matrices m using doomed d where m.id = d.id;
  get diagnostics v_matrices = row_count;

  perform set_config('predictra.pruning', 'off', true);
  return jsonb_build_object('predictions', v_predictions, 'score_matrices', v_matrices);
end;
$$;

