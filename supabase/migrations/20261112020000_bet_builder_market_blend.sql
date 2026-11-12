-- =============================================================================
-- M5 corsia 0 — valore prudente e solo bookmaker italiani (ADR 0028)
-- =============================================================================
-- Verifica su DEV del 12/11/2026: su alcune partite il modello si scosta molto dal
-- mercato (es. Parma–Roma: Roma 53% per il modello, 73% per il mercato). Usando la sola
-- probabilità del modello il Bet Builder vedeva "valore" fino a +150%: non credibile.
-- Inoltre le quote migliori arrivavano spesso da bookmaker non disponibili in Italia.
--
-- Ora, quando le regole della run lo chiedono:
--   - probabilità usata = (1 − market_weight)·modello + market_weight·mercato, dove il
--     mercato è il consenso de-marginato di tutti i bookmaker (anche internazionali);
--   - la quota della proposta deve essere di un bookmaker italiano (italian_market).
-- Le run con regole precedenti restano valide (peso 0, tutti i bookmaker).
-- Le selezioni salvano anche la probabilità del modello e quella del mercato.
-- =============================================================================

alter table public.bet_proposal_legs
  add column model_probability  numeric(10, 8) check (model_probability is null or (model_probability > 0 and model_probability <= 1)),
  add column market_probability numeric(10, 8) check (market_probability is null or (market_probability > 0 and market_probability < 1));

comment on column public.bet_proposal_legs.probability is
  'Probabilità usata per EV e soglie: del modello, o la media pesata modello/mercato (ADR 0028).';

create or replace function public.record_bet_proposals(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_model bigint;
  v_rules jsonb;
  v_proposal jsonb;
  v_leg_ref jsonb;
  v_leg record;
  v_max_age interval;
  v_legs jsonb;
  v_matches bigint[];
  v_teams bigint[];
  v_n integer;
  v_no integer;
  v_prob numeric;
  v_price numeric;
  v_conf numeric;
  v_ev numeric;
  v_first timestamptz;
  v_last timestamptz;
  v_observed timestamptz;
  v_category public.bet_proposal_category;
  v_rank integer;
  v_slate date;
  v_id bigint;
  v_written integer := 0;
  v_skipped integer := 0;
  v_weight numeric;
  v_italian_only boolean;
  v_market_p numeric;
  v_used_p numeric;
  v_italian boolean;
begin
  select model_version_id, rules into v_model, v_rules
  from public.bet_builder_runs where id = p_run_id and status = 'RUNNING';
  if v_model is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
  end if;
  -- ADR 0028: peso del mercato nella probabilità usata e solo bookmaker italiani.
  -- Run con regole precedenti: peso 0 e tutti i bookmaker (comportamento invariato).
  v_weight := coalesce((v_rules ->> 'market_weight')::numeric, 0);
  v_italian_only := coalesce((v_rules ->> 'italian_bookmakers_only')::boolean, false);
  if v_weight < 0 or v_weight > 1 then
    raise exception 'market_weight fuori da [0, 1]' using errcode = '22023';
  end if;

  for v_proposal in
    select e from jsonb_array_elements(coalesce(p_batch -> 'proposals', '[]'::jsonb)) as e
  loop
    v_category := (v_proposal ->> 'category')::public.bet_proposal_category;
    v_rank := (v_proposal ->> 'rank')::integer;
    if v_rank is null or v_rank < 1 or v_rank > (v_rules ->> 'max_proposals_per_category')::integer then
      raise exception 'Posizione % fuori dai limiti della run', v_rank using errcode = '23514';
    end if;
    if jsonb_typeof(v_proposal -> 'rank_score') is distinct from 'number' then
      raise exception 'rank_score mancante' using errcode = '22023';
    end if;
    v_n := jsonb_array_length(coalesce(v_proposal -> 'legs', '[]'::jsonb));
    if v_n < 1 or v_n > (v_rules ->> 'max_legs')::integer then
      raise exception 'Numero di selezioni % fuori dai limiti (1–%)', v_n, v_rules ->> 'max_legs'
        using errcode = '23514';
    end if;

    v_legs := '[]'::jsonb;
    v_matches := '{}';
    v_teams := '{}';
    v_no := 0;
    v_prob := 1;
    v_price := 1;
    v_conf := 1;
    v_first := null;
    v_last := null;
    v_observed := null;

    for v_leg_ref in select l from jsonb_array_elements(v_proposal -> 'legs') as l loop
      v_no := v_no + 1;
      select p.id as prediction_id, p.match_id, p.model_version_id, p.market, p.line, p.selection,
             p.probability, p.push_probability, p.confidence_score, p.as_of,
             s.id as snapshot_id, s.event_id, s.bookmaker, s.market as odds_market,
             s.selection as odds_selection, s.price, s.provider, s.event_time, s.observed_at,
             s.quality, oe.match_id as odds_match_id, m.kickoff_at, m.status as match_status,
             m.home_team_id, m.away_team_id
      into v_leg
      from public.predictions p
      join public.matches m on m.id = p.match_id
      join public.odds_snapshots s on s.id = (v_leg_ref ->> 'odds_snapshot_id')::bigint
      join public.odds_events oe on oe.id = s.event_id
      where p.id = (v_leg_ref ->> 'prediction_id')::bigint;
      if not found then
        raise exception 'Selezione %: previsione o quota inesistente', v_no using errcode = '23503';
      end if;

      if v_leg.model_version_id <> v_model then
        raise exception 'Selezione %: previsione di un modello diverso da quello della run', v_no
          using errcode = '23514';
      end if;
      if v_leg.odds_match_id is distinct from v_leg.match_id then
        raise exception 'Selezione %: la quota non è della stessa partita', v_no using errcode = '23514';
      end if;
      if app_private.odds_market_for(v_leg.market, v_leg.line) is distinct from v_leg.odds_market
         or v_leg.selection <> v_leg.odds_selection then
        raise exception 'Selezione %: mercato o esito della quota diversi dalla previsione', v_no
          using errcode = '23514';
      end if;
      if coalesce(v_leg.push_probability, 0) > 0 then
        raise exception 'Selezione %: mercati con rimborso non ammessi in v1', v_no using errcode = '23514';
      end if;
      if v_leg.match_status <> 'SCHEDULED' or v_leg.kickoff_at <= now() then
        raise exception 'Selezione %: partita non più in programma', v_no using errcode = '23514';
      end if;
      if v_leg.match_id = any (v_matches) then
        -- ADR 0026: la probabilità congiunta sulla stessa partita richiede la quota reale
        -- della combinazione, che le fonti v1 non forniscono.
        raise exception 'Selezione %: più selezioni sulla stessa partita non ammesse in v1', v_no
          using errcode = '23514';
      end if;
      if v_leg.home_team_id = any (v_teams) or v_leg.away_team_id = any (v_teams) then
        -- ADR 0026 §2: l'indipendenza non vale per due partite della stessa squadra.
        raise exception 'Selezione %: squadra già presente in un''altra selezione', v_no
          using errcode = '23514';
      end if;
      select b.italian_market into v_italian from public.bookmakers b where b.code = v_leg.bookmaker;
      if v_italian_only and not coalesce(v_italian, false) then
        raise exception 'Selezione %: la quota non è di un bookmaker italiano', v_no
          using errcode = '23514';
      end if;
      -- Probabilità usata: (1 − w)·modello + w·mercato. Il consenso di mercato è
      -- calcolato dal motore sulle quote FRESH di tutti i bookmaker (de-margin).
      v_market_p := null;
      if v_weight > 0 then
        if jsonb_typeof(v_leg_ref -> 'market_probability') is distinct from 'number' then
          raise exception 'Selezione %: probabilità di mercato mancante', v_no using errcode = '22023';
        end if;
        v_market_p := (v_leg_ref ->> 'market_probability')::numeric;
        if v_market_p <= 0 or v_market_p >= 1 then
          raise exception 'Selezione %: probabilità di mercato fuori da (0, 1)', v_no
            using errcode = '22023';
        end if;
      end if;
      v_used_p := round((1 - v_weight) * v_leg.probability + v_weight * coalesce(v_market_p, 0), 8);

      if v_leg.quality <> 'OK' then
        raise exception 'Selezione %: quota con problemi di qualità', v_no using errcode = '23514';
      end if;
      if exists (
        select 1 from public.odds_snapshots s2
        where s2.event_id = v_leg.event_id and s2.bookmaker = v_leg.bookmaker
          and s2.market = v_leg.odds_market and s2.selection = v_leg.odds_selection
          and s2.event_time > v_leg.event_time
      ) then
        raise exception 'Selezione %: esiste una quota più recente', v_no using errcode = '23514';
      end if;
      select r.max_age into v_max_age
      from public.source_freshness_rules r
      where r.provider = v_leg.provider and r.data_kind = 'odds';
      if v_max_age is not null and v_leg.observed_at < now() - v_max_age then
        raise exception 'Selezione %: quota STALE', v_no using errcode = '23514';
      end if;
      if exists (
        select 1 from public.predictions p2
        where p2.match_id = v_leg.match_id and p2.model_version_id = v_leg.model_version_id
          and p2.market = v_leg.market and p2.line is not distinct from v_leg.line
          and p2.selection = v_leg.selection and p2.as_of > v_leg.as_of
      ) then
        raise exception 'Selezione %: esiste una previsione più recente', v_no using errcode = '23514';
      end if;
      if v_used_p < (v_rules ->> 'min_leg_probability')::numeric
         or v_leg.confidence_score < (v_rules ->> 'min_confidence_score')::numeric
         or v_used_p * v_leg.price - 1 < (v_rules ->> 'min_leg_expected_value')::numeric then
        raise exception 'Selezione %: sotto le soglie della run', v_no using errcode = '23514';
      end if;

      v_matches := v_matches || v_leg.match_id;
      v_teams := v_teams || v_leg.home_team_id || v_leg.away_team_id;
      v_prob := v_prob * v_used_p;
      v_price := v_price * v_leg.price;
      v_conf := least(v_conf, v_leg.confidence_score);
      v_first := least(v_first, v_leg.kickoff_at);
      v_last := greatest(v_last, v_leg.kickoff_at);
      v_observed := least(v_observed, v_leg.observed_at);
      v_legs := v_legs || jsonb_build_object(
        'leg_no', v_no, 'match_id', v_leg.match_id, 'prediction_id', v_leg.prediction_id,
        'odds_snapshot_id', v_leg.snapshot_id, 'market', v_leg.market, 'line', v_leg.line,
        'selection', v_leg.selection, 'probability', v_used_p,
        'model_probability', v_leg.probability, 'market_probability', v_market_p,
        'confidence_score', v_leg.confidence_score, 'bookmaker', v_leg.bookmaker,
        'price', v_leg.price, 'odds_event_time', v_leg.event_time,
        'odds_observed_at', v_leg.observed_at);
    end loop;

    v_prob := round(v_prob, 8);
    v_price := round(v_price, 6);
    v_ev := round(v_prob * v_price - 1, 6);
    if v_prob < (v_rules ->> 'min_probability')::numeric
       or v_ev < (v_rules ->> 'min_expected_value')::numeric
       or v_conf < (v_rules ->> 'min_confidence_score')::numeric then
      raise exception 'Proposta sotto le soglie della run (probabilità %, EV %, Confidence %)',
        v_prob, v_ev, v_conf using errcode = '23514';
    end if;

    v_slate := (v_first at time zone 'Europe/Rome')::date;
    if exists (
      select 1 from public.bet_proposals
      where run_id = p_run_id and slate_date = v_slate and category = v_category and rank = v_rank
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.bet_proposals
      (run_id, model_version_id, kind, category, slate_date, rank, rank_score, legs_count,
       probability, combined_price, expected_value, confidence_score, first_kickoff_at,
       last_kickoff_at, odds_observed_at, explanation)
    values
      (p_run_id, v_model, case when v_n = 1 then 'SINGLE' else 'MULTIPLE' end::public.bet_proposal_kind,
       v_category, v_slate, v_rank, (v_proposal ->> 'rank_score')::numeric, v_n, v_prob, v_price,
       v_ev, v_conf, v_first, v_last, v_observed, coalesce(v_proposal -> 'explanation', '{}'::jsonb))
    returning id into v_id;

    insert into public.bet_proposal_legs
      (proposal_id, leg_no, match_id, prediction_id, odds_snapshot_id, market, line, selection,
       probability, model_probability, market_probability, confidence_score, bookmaker, price,
       odds_event_time, odds_observed_at)
    select v_id, (l ->> 'leg_no')::smallint, (l ->> 'match_id')::bigint, (l ->> 'prediction_id')::bigint,
           (l ->> 'odds_snapshot_id')::bigint, l ->> 'market', (l ->> 'line')::numeric, l ->> 'selection',
           (l ->> 'probability')::numeric, (l ->> 'model_probability')::numeric,
           (l ->> 'market_probability')::numeric, (l ->> 'confidence_score')::numeric, l ->> 'bookmaker',
           (l ->> 'price')::numeric, (l ->> 'odds_event_time')::timestamptz,
           (l ->> 'odds_observed_at')::timestamptz
    from jsonb_array_elements(v_legs) as l;

    v_written := v_written + 1;
  end loop;

  update public.bet_builder_runs
  set proposals_written = proposals_written + v_written
  where id = p_run_id;

  return jsonb_build_object('proposals', v_written, 'skipped', v_skipped);
end;
$$;

create or replace view public.v_bet_proposal_legs
with (security_invoker = true) as
select
  l.proposal_id,
  l.leg_no,
  l.match_id,
  m.kickoff_at,
  m.status as match_status,
  m.competition_id,
  hm.name as home_team_name,
  aw.name as away_team_name,
  l.market,
  l.line,
  l.selection,
  l.probability,
  l.confidence_score,
  l.bookmaker,
  b.title as bookmaker_title,
  l.price,
  l.odds_event_time,
  l.odds_observed_at,
  l.prediction_id,
  l.odds_snapshot_id,
  cur.price as current_price,
  cur.observed_at as current_observed_at,
  case
    when cur.observed_at is null then 'STALE'
    when r.max_age is null then 'FRESH'
    when cur.observed_at >= now() - r.max_age then 'FRESH'
    else 'STALE'
  end::public.freshness_status as current_freshness,
  l.model_probability,
  l.market_probability,
  b.italian_market
from public.bet_proposal_legs l
join public.matches m on m.id = l.match_id
join public.teams hm on hm.id = m.home_team_id
join public.teams aw on aw.id = m.away_team_id
join public.bookmakers b on b.code = l.bookmaker
join public.odds_snapshots s on s.id = l.odds_snapshot_id
left join lateral (
  select s2.price, s2.observed_at
  from public.odds_snapshots s2
  where s2.event_id = s.event_id and s2.bookmaker = s.bookmaker
    and s2.market = s.market and s2.selection = s.selection
  order by s2.event_time desc, s2.observed_at desc
  limit 1
) cur on true
left join public.source_freshness_rules r on r.provider = s.provider and r.data_kind = 'odds';
