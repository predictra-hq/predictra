-- =============================================================================
-- PREDICTRA — M5 corsia 0: Smart Bet Builder (contratto)
-- =============================================================================
-- Decisioni: docs/decisions/0025-regole-combinazioni.md, 0026-correlazioni.md,
--            0027-motore-ranking-categorie.md
-- Dizionario: docs/data-dictionary/bet-builder.md
--
-- Principi:
--  * le proposte nascono solo da previsioni del modello attivo (M4) e da quote
--    reali FRESH (M3): probabilità, quota combinata, EV e Confidence Score li
--    calcola il database dalle righe referenziate, non li riceve dal motore;
--  * nessuna schedina forzata: le soglie della run sono verificate qui; una run
--    senza proposte valide resta una run con zero proposte;
--  * proposte e selezioni sono immutabili (app_private.forbid_mutation di M4);
--  * lettura per utenti attivi; scrittura solo dal motore (service_role) tramite
--    funzioni;
--  * le schedine salvate dagli utenti sono private: RLS solo proprietario,
--    nessuna policy per admin o Super Admin, nessun privilegio a service_role.
-- =============================================================================

create type public.bet_proposal_kind as enum ('SINGLE', 'MULTIPLE', 'SAME_MATCH');
create type public.bet_proposal_category as enum ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE');

-- -----------------------------------------------------------------------------
-- Corrispondenza mercato del modello → mercato delle quote (v1: solo 1X2 ↔ h2h)
-- -----------------------------------------------------------------------------
create function app_private.odds_market_for(p_market text, p_line numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_market = '1X2' and p_line is null then 'h2h' end;
$$;

-- Soglie della run (ADR 0025 §3): tutte obbligatorie, con limiti di buon senso.
create function app_private.assert_bet_builder_rules(p jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Regole della run mancanti' using errcode = '22023';
  end if;
  if coalesce(p ->> 'rules_version', '') !~ '^[A-Za-z0-9._-]{1,40}$' then
    raise exception 'rules_version mancante o non valida' using errcode = '22023';
  end if;
  foreach k in array array['max_legs', 'max_proposals_per_category', 'min_leg_probability',
                           'min_probability', 'min_leg_expected_value', 'min_expected_value',
                           'min_confidence_score'] loop
    if jsonb_typeof(p -> k) is distinct from 'number' then
      raise exception 'Regola % mancante o non numerica', k using errcode = '22023';
    end if;
  end loop;
  if (p ->> 'max_legs')::numeric not between 1 and 10
     or (p ->> 'max_legs')::numeric <> trunc((p ->> 'max_legs')::numeric) then
    raise exception 'max_legs deve essere un intero tra 1 e 10' using errcode = '22023';
  end if;
  if (p ->> 'max_proposals_per_category')::numeric not between 1 and 100
     or (p ->> 'max_proposals_per_category')::numeric
        <> trunc((p ->> 'max_proposals_per_category')::numeric) then
    raise exception 'max_proposals_per_category deve essere un intero tra 1 e 100' using errcode = '22023';
  end if;
  if (p ->> 'min_leg_probability')::numeric not between 0 and 1
     or (p ->> 'min_probability')::numeric not between 0 and 1
     or (p ->> 'min_confidence_score')::numeric not between 0 and 1 then
    raise exception 'Le soglie di probabilità e Confidence Score sono tra 0 e 1' using errcode = '22023';
  end if;
  -- Nessuna proposta senza valore atteso positivo; nessuna selezione con EV negativo.
  if (p ->> 'min_expected_value')::numeric <= 0 or (p ->> 'min_leg_expected_value')::numeric < 0 then
    raise exception 'min_expected_value deve essere > 0 e min_leg_expected_value >= 0' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Esecuzioni del motore delle combinazioni
-- -----------------------------------------------------------------------------
create table public.bet_builder_runs (
  id                    bigint generated always as identity primary key,
  model_version_id      bigint not null references public.model_versions (id),
  status                public.ingestion_run_status not null default 'RUNNING',
  triggered_by          text not null default 'schedule' check (triggered_by in ('schedule', 'manual')),
  code_commit           text not null check (code_commit ~ '^[0-9a-f]{7,40}$'),
  -- Soglie usate (ADR 0025): copiate nella run per riprodurre le proposte.
  rules                 jsonb not null check (jsonb_typeof(rules) = 'object'),
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  candidates_evaluated  integer not null default 0 check (candidates_evaluated >= 0),
  proposals_written     integer not null default 0 check (proposals_written >= 0),
  error_summary         text check (error_summary is null or char_length(error_summary) <= 2000),
  constraint bet_builder_runs_finished_consistency check ((status = 'RUNNING') = (finished_at is null)),
  constraint bet_builder_runs_finished_after_start check (finished_at is null or finished_at >= started_at)
);
create index bet_builder_runs_started_idx on public.bet_builder_runs (started_at desc);
create index bet_builder_runs_finished_idx on public.bet_builder_runs (status, finished_at desc);

-- -----------------------------------------------------------------------------
-- Proposte (immutabili)
-- -----------------------------------------------------------------------------
create table public.bet_proposals (
  id                bigint generated always as identity primary key,
  run_id            bigint not null references public.bet_builder_runs (id),
  model_version_id  bigint not null references public.model_versions (id),
  kind              public.bet_proposal_kind not null,
  category          public.bet_proposal_category not null,
  -- Giornata: data (Europe/Rome) del primo calcio d'inizio della proposta.
  slate_date        date not null,
  rank              smallint not null check (rank >= 1),
  rank_score        numeric(12, 6) not null,
  legs_count        smallint not null check (legs_count between 1 and 10),
  -- Probabilità di vincita della combinazione (prodotto delle selezioni: ADR 0026).
  probability       numeric(10, 8) not null check (probability > 0 and probability <= 1),
  -- Quota combinata: prodotto delle quote reali delle selezioni.
  combined_price    numeric(16, 6) not null check (combined_price > 1),
  -- EV per unità puntata: probability · combined_price − 1.
  expected_value    numeric(12, 6) not null check (expected_value > -1),
  -- Il più basso tra i Confidence Score delle selezioni.
  confidence_score  numeric(5, 4) not null check (confidence_score between 0 and 1),
  -- Solo per SAME_MATCH (non ammesse in v1, ADR 0026): matrice usata per la probabilità congiunta.
  score_matrix_id   bigint references public.prediction_score_matrices (id),
  first_kickoff_at  timestamptz not null,
  last_kickoff_at   timestamptz not null,
  -- Lettura più vecchia tra le quote usate, al momento della generazione.
  odds_observed_at  timestamptz not null,
  explanation       jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  created_at        timestamptz not null default now(),
  constraint bet_proposals_kind_legs check ((kind = 'SINGLE') = (legs_count = 1)),
  constraint bet_proposals_same_match_matrix check ((kind = 'SAME_MATCH') = (score_matrix_id is not null)),
  constraint bet_proposals_kickoff_order check (last_kickoff_at >= first_kickoff_at),
  constraint bet_proposals_rank_unique unique (run_id, slate_date, category, rank)
);
create index bet_proposals_slate_idx on public.bet_proposals (slate_date, category, rank);

create table public.bet_proposal_legs (
  id                bigint generated always as identity primary key,
  proposal_id       bigint not null references public.bet_proposals (id),
  leg_no            smallint not null check (leg_no between 1 and 10),
  match_id          bigint not null references public.matches (id) on delete restrict,
  prediction_id     bigint not null references public.predictions (id) on delete restrict,
  odds_snapshot_id  bigint not null references public.odds_snapshots (id) on delete restrict,
  -- Copie dei valori al momento della generazione (le righe sorgenti restano referenziate).
  market            text not null,
  line              numeric(5, 2),
  selection         text not null,
  probability       numeric(10, 8) not null check (probability > 0 and probability <= 1),
  confidence_score  numeric(5, 4) not null check (confidence_score between 0 and 1),
  bookmaker         text not null references public.bookmakers (code),
  price             numeric(8, 3) not null check (price > 1),
  odds_event_time   timestamptz not null,
  odds_observed_at  timestamptz not null,
  constraint bet_proposal_legs_unique unique (proposal_id, leg_no),
  constraint bet_proposal_legs_prediction_unique unique (proposal_id, prediction_id)
);
create index bet_proposal_legs_match_idx on public.bet_proposal_legs (match_id);

create trigger bet_proposals_immutable before update or delete on public.bet_proposals
  for each row execute function app_private.forbid_mutation();
create trigger bet_proposals_no_truncate before truncate on public.bet_proposals
  for each statement execute function app_private.forbid_mutation();
create trigger bet_proposal_legs_immutable before update or delete on public.bet_proposal_legs
  for each row execute function app_private.forbid_mutation();
create trigger bet_proposal_legs_no_truncate before truncate on public.bet_proposal_legs
  for each statement execute function app_private.forbid_mutation();

-- -----------------------------------------------------------------------------
-- Schedine salvate dagli utenti (private)
-- -----------------------------------------------------------------------------
create table public.user_bet_slips (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 80),
  notes               text check (notes is null or char_length(notes) <= 1000),
  -- Proposta da cui è partita la schedina, se c'è.
  source_proposal_id  bigint references public.bet_proposals (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_bet_slips_id_user unique (id, user_id)
);
create index user_bet_slips_user_idx on public.user_bet_slips (user_id, created_at desc);

create table public.user_bet_slip_selections (
  id                bigint generated always as identity primary key,
  slip_id           bigint not null,
  user_id           uuid not null default auth.uid(),
  leg_no            smallint not null check (leg_no between 1 and 10),
  match_id          bigint not null references public.matches (id) on delete restrict,
  market            text not null check (market in (
                      '1X2', 'DOUBLE_CHANCE', 'DNB', 'TOTAL_GOALS', 'BTTS', 'TEAM_GOALS',
                      'CORRECT_SCORE', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP')),
  line              numeric(5, 2) check (line is null or (line * 2) = trunc(line * 2)),
  selection         text not null check (selection ~ '^[A-Z0-9_-]{1,20}$'),
  -- Riferimenti facoltativi: i valori mostrati si leggono sempre dalle righe sorgenti.
  prediction_id     bigint references public.predictions (id) on delete restrict,
  odds_snapshot_id  bigint references public.odds_snapshots (id) on delete restrict,
  created_at        timestamptz not null default now(),
  -- La selezione appartiene alla schedina dello stesso utente.
  constraint user_bet_slip_selections_slip_fk foreign key (slip_id, user_id)
    references public.user_bet_slips (id, user_id) on delete cascade,
  constraint user_bet_slip_selections_unique unique (slip_id, leg_no),
  constraint user_bet_slip_selections_line_markets
    check ((market in ('TOTAL_GOALS', 'TEAM_GOALS', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP')) = (line is not null))
);
create index user_bet_slip_selections_slip_idx on public.user_bet_slip_selections (slip_id, leg_no);

create trigger user_bet_slips_touch before update on public.user_bet_slips
  for each row execute function app_private.touch_updated_at();

-- Coerenza dei riferimenti facoltativi con partita, mercato, linea e selezione.
create function app_private.check_slip_selection()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.prediction_id is not null and not exists (
    select 1 from public.predictions p
    where p.id = new.prediction_id and p.match_id = new.match_id and p.market = new.market
      and p.line is not distinct from new.line and p.selection = new.selection
  ) then
    raise exception 'La previsione % non corrisponde alla selezione', new.prediction_id
      using errcode = '23514';
  end if;
  if new.odds_snapshot_id is not null and not exists (
    select 1 from public.odds_snapshots s
    join public.odds_events e on e.id = s.event_id
    where s.id = new.odds_snapshot_id and e.match_id = new.match_id
      and s.market = app_private.odds_market_for(new.market, new.line)
      and s.selection = new.selection
  ) then
    raise exception 'La quota % non corrisponde alla selezione', new.odds_snapshot_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_bet_slip_selections_check before insert or update on public.user_bet_slip_selections
  for each row execute function app_private.check_slip_selection();

-- -----------------------------------------------------------------------------
-- Funzioni per il motore (service_role)
-- -----------------------------------------------------------------------------
create function public.start_bet_builder_run(
  p_model_version_id bigint, p_code_commit text, p_rules jsonb, p_triggered_by text default 'schedule'
) returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.model_versions where id = p_model_version_id and status = 'ACTIVE') then
    raise exception 'La versione % non è il modello attivo', p_model_version_id using errcode = '23514';
  end if;
  perform app_private.assert_bet_builder_rules(p_rules);
  -- Esecuzioni rimaste aperte da più di 1 ora: chiuse come fallite.
  update public.bet_builder_runs
  set status = 'FAILED', finished_at = now(),
      error_summary = 'Esecuzione interrotta: chiusa automaticamente dopo 1 ora'
  where status = 'RUNNING' and started_at < now() - interval '1 hour';
  insert into public.bet_builder_runs (model_version_id, code_commit, rules, triggered_by)
  values (p_model_version_id, p_code_commit, p_rules, p_triggered_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- p_batch: {"proposals": [{"category", "rank", "rank_score", "explanation",
--            "legs": [{"prediction_id", "odds_snapshot_id"}]}]}
-- Il database ricava tipo, probabilità, quota combinata, EV, Confidence Score e
-- giornata dalle righe referenziate e rifiuta l'intero lotto se una proposta
-- viola le regole della run (ADR 0025, 0026). Rieseguire lo stesso lotto non
-- duplica nulla (chiave: run, giornata, categoria, posizione).
create function public.record_bet_proposals(p_run_id bigint, p_batch jsonb)
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
begin
  select model_version_id, rules into v_model, v_rules
  from public.bet_builder_runs where id = p_run_id and status = 'RUNNING';
  if v_model is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
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
      if v_leg.probability < (v_rules ->> 'min_leg_probability')::numeric
         or v_leg.confidence_score < (v_rules ->> 'min_confidence_score')::numeric
         or v_leg.probability * v_leg.price - 1 < (v_rules ->> 'min_leg_expected_value')::numeric then
        raise exception 'Selezione %: sotto le soglie della run', v_no using errcode = '23514';
      end if;

      v_matches := v_matches || v_leg.match_id;
      v_teams := v_teams || v_leg.home_team_id || v_leg.away_team_id;
      v_prob := v_prob * v_leg.probability;
      v_price := v_price * v_leg.price;
      v_conf := least(v_conf, v_leg.confidence_score);
      v_first := least(v_first, v_leg.kickoff_at);
      v_last := greatest(v_last, v_leg.kickoff_at);
      v_observed := least(v_observed, v_leg.observed_at);
      v_legs := v_legs || jsonb_build_object(
        'leg_no', v_no, 'match_id', v_leg.match_id, 'prediction_id', v_leg.prediction_id,
        'odds_snapshot_id', v_leg.snapshot_id, 'market', v_leg.market, 'line', v_leg.line,
        'selection', v_leg.selection, 'probability', v_leg.probability,
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
       probability, confidence_score, bookmaker, price, odds_event_time, odds_observed_at)
    select v_id, (l ->> 'leg_no')::smallint, (l ->> 'match_id')::bigint, (l ->> 'prediction_id')::bigint,
           (l ->> 'odds_snapshot_id')::bigint, l ->> 'market', (l ->> 'line')::numeric, l ->> 'selection',
           (l ->> 'probability')::numeric, (l ->> 'confidence_score')::numeric, l ->> 'bookmaker',
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

create function public.finish_bet_builder_run(
  p_run_id bigint, p_status public.ingestion_run_status, p_candidates_evaluated integer default 0,
  p_error_summary text default null
) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_status = 'RUNNING' then
    raise exception 'Lo stato finale non può essere RUNNING' using errcode = '22023';
  end if;
  update public.bet_builder_runs
  set status = p_status, finished_at = now(),
      candidates_evaluated = coalesce(p_candidates_evaluated, 0),
      error_summary = left(p_error_summary, 2000)
  where id = p_run_id and status = 'RUNNING';
  if not found then
    raise exception 'Esecuzione % inesistente o già chiusa', p_run_id using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Viste per l'interfaccia
-- -----------------------------------------------------------------------------

-- Ultima esecuzione (qualsiasi stato): serve allo stato vuoto ("zero proposte").
create view public.v_bet_builder_latest_run
with (security_invoker = true) as
select
  r.id as run_id,
  r.status,
  r.triggered_by,
  r.started_at,
  r.finished_at,
  r.candidates_evaluated,
  r.proposals_written,
  r.rules,
  mv.id as model_version_id,
  mv.model_key,
  mv.version as model_version
from public.bet_builder_runs r
join public.model_versions mv on mv.id = r.model_version_id
order by r.started_at desc, r.id desc
limit 1;

-- Selezioni di ogni proposta con partita e stato attuale della quota usata.
create view public.v_bet_proposal_legs
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
  end::public.freshness_status as current_freshness
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

-- Proposte attive: dell'ultima esecuzione riuscita, del modello attivo, con il
-- primo calcio d'inizio ancora da venire. Si filtrano per giornata e categoria.
create view public.v_active_bet_proposals
with (security_invoker = true) as
with latest as (
  select r.id
  from public.bet_builder_runs r
  where r.status = 'SUCCEEDED'
  order by r.finished_at desc, r.id desc
  limit 1
)
select
  bp.id as proposal_id,
  bp.run_id,
  bp.slate_date,
  bp.category,
  bp.rank,
  bp.rank_score,
  bp.kind,
  bp.legs_count,
  bp.probability,
  bp.combined_price,
  bp.expected_value,
  bp.confidence_score,
  bp.first_kickoff_at,
  bp.last_kickoff_at,
  bp.odds_observed_at,
  -- Stato attuale delle quote usate (alla generazione erano tutte FRESH).
  st.legs_stale,
  st.legs_price_changed,
  bp.explanation,
  bp.created_at,
  mv.id as model_version_id,
  mv.model_key,
  mv.version as model_version
from public.bet_proposals bp
join latest on latest.id = bp.run_id
join public.model_versions mv on mv.id = bp.model_version_id and mv.status = 'ACTIVE'
cross join lateral (
  select
    (count(*) filter (where l.current_freshness = 'STALE'))::integer as legs_stale,
    (count(*) filter (where l.current_price is distinct from l.price))::integer as legs_price_changed
  from public.v_bet_proposal_legs l
  where l.proposal_id = bp.id
) st
where bp.first_kickoff_at > now();

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table public.bet_builder_runs         enable row level security;
alter table public.bet_proposals            enable row level security;
alter table public.bet_proposal_legs        enable row level security;
alter table public.user_bet_slips           enable row level security;
alter table public.user_bet_slip_selections enable row level security;

revoke all on
  public.bet_builder_runs, public.bet_proposals, public.bet_proposal_legs,
  public.v_bet_builder_latest_run, public.v_active_bet_proposals, public.v_bet_proposal_legs
from public, anon, authenticated;
-- Schedine: nessun privilegio nemmeno alla chiave secret (dati personali, CLAUDE.md).
revoke all on public.user_bet_slips, public.user_bet_slip_selections
  from public, anon, authenticated, service_role;

grant select on
  public.bet_builder_runs, public.bet_proposals, public.bet_proposal_legs,
  public.v_bet_builder_latest_run, public.v_active_bet_proposals, public.v_bet_proposal_legs
to authenticated;
grant select, insert, update, delete on public.user_bet_slips, public.user_bet_slip_selections
  to authenticated;

-- Il motore scrive solo tramite le funzioni; UPDATE sulle run serve a finish/start.
grant select, insert, update on public.bet_builder_runs to service_role;
grant select, insert on public.bet_proposals, public.bet_proposal_legs to service_role;
grant select on public.v_bet_builder_latest_run, public.v_active_bet_proposals, public.v_bet_proposal_legs
  to service_role;

create policy bet_builder_runs_read on public.bet_builder_runs for select to authenticated
  using (app_private.is_active_user());
create policy bet_proposals_read on public.bet_proposals for select to authenticated
  using (app_private.is_active_user());
create policy bet_proposal_legs_read on public.bet_proposal_legs for select to authenticated
  using (app_private.is_active_user());

-- Schedine: SOLO il proprietario. Nessuna policy per admin o Super Admin.
create policy user_bet_slips_owner on public.user_bet_slips for all to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid() and app_private.is_active_user());
create policy user_bet_slip_selections_owner on public.user_bet_slip_selections for all to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid() and app_private.is_active_user());

revoke execute on function app_private.odds_market_for(text, numeric) from public, anon;
grant execute on function app_private.odds_market_for(text, numeric) to authenticated, service_role;
revoke execute on function app_private.assert_bet_builder_rules(jsonb) from public, anon, authenticated;
grant execute on function app_private.assert_bet_builder_rules(jsonb) to service_role;
revoke execute on function app_private.check_slip_selection() from public, anon, authenticated;

revoke execute on function public.start_bet_builder_run(bigint, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.record_bet_proposals(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_bet_builder_run(bigint, public.ingestion_run_status, integer, text)
  from public, anon, authenticated;
grant execute on function public.start_bet_builder_run(bigint, text, jsonb, text) to service_role;
grant execute on function public.record_bet_proposals(bigint, jsonb) to service_role;
grant execute on function public.finish_bet_builder_run(bigint, public.ingestion_run_status, integer, text)
  to service_role;
