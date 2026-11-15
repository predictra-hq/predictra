-- =============================================================================
-- PREDICTRA — M3 corsia 0: quote, margine e statistiche (contratto)
-- =============================================================================
-- Decisioni: docs/decisions/0015-quote-v1.md, 0016-de-margin.md
-- Dizionario: docs/data-dictionary/odds.md
--
-- Principi (come M2):
--  * ogni quota conserva provider, observed_at, event_time (last_update del
--    provider) e qualità; la licenza si ricava da providers;
--  * lettura per utenti autenticati attivi, scrittura solo con la chiave secret
--    tramite funzioni; alias manuali solo da Super Admin con 2FA (audit);
--  * nessuna quota viene inserita da questa migrazione: solo cataloghi
--    (provider, mercato 1X2) e soglie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Provider: The Odds API e tipo di dato principale (per la freschezza)
-- -----------------------------------------------------------------------------
alter table public.providers
  add column primary_data_kind public.football_data_kind not null default 'matches';

insert into public.providers
  (code, name, website, terms_url, terms_verified_at, licence_summary, attribution, docs_path,
   primary_data_kind)
values
  ('the-odds-api', 'The Odds API', 'https://the-odds-api.com',
   'https://the-odds-api.com/terms-and-conditions.html', date '2026-11-07',
   'Piano Starter: 500 crediti/mese (1 per mercato per regione). Consentiti conservazione, visualizzazione, valori derivati e addestramento di modelli; vietata la rivendita o ridistribuzione come feed di dati. Attribuzione non obbligatoria.',
   'Quote: The Odds API',
   'docs/data-sources/the-odds-api.md',
   'odds');

insert into public.source_freshness_rules (provider, data_kind, max_age) values
  ('the-odds-api', 'odds', interval '12 hours');

-- -----------------------------------------------------------------------------
-- Cataloghi
-- -----------------------------------------------------------------------------
create table public.bookmakers (
  code            text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  title           text not null check (char_length(title) between 1 and 80),
  region          text not null check (region ~ '^[a-z0-9_]{2,10}$'),
  -- Versione italiana secondo il provider (chiave che termina con _it). Non indica
  -- un'autorizzazione ADM verificata da PREDICTRA.
  italian_market  boolean not null default false,
  provider        text not null references public.providers (code),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create table public.markets (
  code          text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name          text not null,
  selections    text[] not null check (cardinality(selections) between 2 and 10),
  evaluable     boolean not null default true
);

insert into public.markets (code, name, selections, evaluable) values
  ('h2h', 'Esito finale 1X2', array['HOME', 'DRAW', 'AWAY'], true);

-- -----------------------------------------------------------------------------
-- Eventi e quote
-- -----------------------------------------------------------------------------
create table public.odds_events (
  id                 bigint generated always as identity primary key,
  provider           text not null references public.providers (code),
  provider_event_id  text not null check (char_length(provider_event_id) between 1 and 100),
  sport_key          text not null check (sport_key ~ '^[a-z0-9_]{2,80}$'),
  competition_id     bigint references public.competitions (id) on delete set null,
  match_id           bigint references public.matches (id) on delete set null,
  commence_time      timestamptz not null,
  home_team_name     text not null check (char_length(home_team_name) between 1 and 120),
  away_team_name     text not null check (char_length(away_team_name) between 1 and 120),
  observed_at        timestamptz not null,
  quality            public.quality_status not null default 'OK',
  ingestion_run_id   bigint references public.ingestion_runs (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint odds_events_provider_unique unique (provider, provider_event_id)
);
create index odds_events_match_idx on public.odds_events (match_id);
create index odds_events_competition_commence_idx on public.odds_events (competition_id, commence_time);

create table public.odds_snapshots (
  id                 bigint generated always as identity primary key,
  event_id           bigint not null references public.odds_events (id) on delete cascade,
  bookmaker          text not null references public.bookmakers (code),
  market             text not null references public.markets (code),
  selection          text not null check (selection ~ '^[A-Z_]{2,20}$'),
  price              numeric(8, 3) not null check (price > 1),
  provider           text not null references public.providers (code),
  -- last_update del mercato secondo il provider.
  event_time         timestamptz not null,
  first_observed_at  timestamptz not null,
  -- Ultima lettura che ha confermato questa quota.
  observed_at        timestamptz not null,
  quality            public.quality_status not null default 'OK',
  ingestion_run_id   bigint references public.ingestion_runs (id) on delete set null,
  constraint odds_snapshots_unique unique (event_id, bookmaker, market, selection, event_time),
  constraint odds_snapshots_observed_order check (observed_at >= first_observed_at)
);
create index odds_snapshots_latest_idx
  on public.odds_snapshots (event_id, bookmaker, market, selection, event_time desc);

create trigger odds_events_touch before update on public.odds_events
  for each row execute function app_private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Funzioni di supporto
-- -----------------------------------------------------------------------------
-- Stessa normalizzazione di team_aliases.normalized_alias.
create function app_private.normalize_team_name(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
$$;

-- Squadra canonica con quell'alias; null se nessuna o più di una.
create function app_private.team_by_alias(p_name text)
returns bigint
language sql stable set search_path = ''
as $$
  select case when count(distinct team_id) = 1 then min(team_id) end
  from public.team_aliases
  where normalized_alias = app_private.normalize_team_name(p_name);
$$;

-- -----------------------------------------------------------------------------
-- Scrittura di un lotto di quote (una competizione)
-- -----------------------------------------------------------------------------
-- Formato di p_batch (prodotto dall'adapter):
-- {
--   "observed_at": "...", "competition_code": "SA", "sport_key": "soccer_italy_serie_a",
--   "events": [{provider_event_id, commence_time, home_team, away_team,
--     "bookmakers": [{key, title, region,
--       "markets": [{key, last_update, "outcomes": [{selection, price}]}]}]}]
-- }
-- selection è già canonica (HOME, DRAW, AWAY per h2h).
create function public.ingest_odds_batch(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_provider     text;
  v_observed     timestamptz := coalesce((p_batch ->> 'observed_at')::timestamptz, now());
  v_comp_id      bigint;
  v_event        jsonb;
  v_book         jsonb;
  v_market       jsonb;
  v_outcome      jsonb;
  v_event_id     bigint;
  v_home         bigint;
  v_away         bigint;
  v_match        bigint;
  v_commence     timestamptz;
  v_events       integer := 0;
  v_matched      integer := 0;
  v_inserted     integer := 0;
  v_confirmed    integer := 0;
  v_skipped      integer := 0;
  v_new          boolean;
  v_selections   text[];
begin
  select provider into v_provider
  from public.ingestion_runs where id = p_run_id and status = 'RUNNING';
  if v_provider is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
  end if;

  select id into v_comp_id from public.competitions where code = p_batch ->> 'competition_code';

  for v_event in select * from jsonb_array_elements(coalesce(p_batch -> 'events', '[]'::jsonb)) loop
    v_commence := (v_event ->> 'commence_time')::timestamptz;
    v_home := app_private.team_by_alias(v_event ->> 'home_team');
    v_away := app_private.team_by_alias(v_event ->> 'away_team');
    v_match := null;
    if v_comp_id is not null and v_home is not null and v_away is not null then
      select m.id into v_match
      from public.matches m
      where m.competition_id = v_comp_id and m.home_team_id = v_home and m.away_team_id = v_away
        and m.kickoff_at between v_commence - interval '36 hours' and v_commence + interval '36 hours'
      order by abs(extract(epoch from (m.kickoff_at - v_commence)))
      limit 1;
    end if;

    insert into public.odds_events
      (provider, provider_event_id, sport_key, competition_id, match_id, commence_time,
       home_team_name, away_team_name, observed_at, ingestion_run_id)
    values (v_provider, v_event ->> 'provider_event_id', p_batch ->> 'sport_key', v_comp_id,
            v_match, v_commence, v_event ->> 'home_team', v_event ->> 'away_team', v_observed,
            p_run_id)
    on conflict (provider, provider_event_id) do update
      set sport_key = excluded.sport_key,
          competition_id = excluded.competition_id,
          match_id = coalesce(excluded.match_id, public.odds_events.match_id),
          commence_time = excluded.commence_time,
          home_team_name = excluded.home_team_name,
          away_team_name = excluded.away_team_name,
          observed_at = excluded.observed_at,
          ingestion_run_id = excluded.ingestion_run_id
    returning id, match_id into v_event_id, v_match;
    v_events := v_events + 1;

    -- Problema di qualità per gli eventi non abbinati; chiuso quando l'abbinamento riesce.
    if v_match is null then
      update public.data_quality_issues
      set last_seen_at = now(), ingestion_run_id = p_run_id,
          details = jsonb_build_object('home_team', v_event ->> 'home_team',
                                       'away_team', v_event ->> 'away_team',
                                       'commence_time', v_event ->> 'commence_time',
                                       'competition_code', p_batch ->> 'competition_code')
      where status = 'OPEN' and check_code = 'odds.event_unmatched' and provider = v_provider
        and entity_type is null and entity_id is null
        and provider_entity_id = v_event ->> 'provider_event_id';
      if not found then
        insert into public.data_quality_issues
          (provider, provider_entity_id, check_code, severity, details, ingestion_run_id)
        values (v_provider, v_event ->> 'provider_event_id', 'odds.event_unmatched', 'WARNING',
                jsonb_build_object('home_team', v_event ->> 'home_team',
                                   'away_team', v_event ->> 'away_team',
                                   'commence_time', v_event ->> 'commence_time',
                                   'competition_code', p_batch ->> 'competition_code'),
                p_run_id);
      end if;
    else
      v_matched := v_matched + 1;
      update public.data_quality_issues
      set status = 'RESOLVED', resolved_at = now(), ingestion_run_id = p_run_id
      where status = 'OPEN' and check_code = 'odds.event_unmatched' and provider = v_provider
        and provider_entity_id = v_event ->> 'provider_event_id';
    end if;

    for v_book in select * from jsonb_array_elements(coalesce(v_event -> 'bookmakers', '[]'::jsonb)) loop
      insert into public.bookmakers (code, title, region, italian_market, provider, first_seen_at, last_seen_at)
      values (v_book ->> 'key', v_book ->> 'title', coalesce(v_book ->> 'region', 'eu'),
              (v_book ->> 'key') like '%\_it', v_provider, v_observed, v_observed)
      on conflict (code) do update
        set title = excluded.title, last_seen_at = greatest(public.bookmakers.last_seen_at, excluded.last_seen_at);

      for v_market in select * from jsonb_array_elements(coalesce(v_book -> 'markets', '[]'::jsonb)) loop
        select selections into v_selections from public.markets where code = v_market ->> 'key';
        if v_selections is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        for v_outcome in select * from jsonb_array_elements(coalesce(v_market -> 'outcomes', '[]'::jsonb)) loop
          if (v_outcome ->> 'price')::numeric <= 1
             or not (v_outcome ->> 'selection') = any (v_selections) then
            v_skipped := v_skipped + 1;
            continue;
          end if;
          insert into public.odds_snapshots
            (event_id, bookmaker, market, selection, price, provider, event_time,
             first_observed_at, observed_at, ingestion_run_id)
          values (v_event_id, v_book ->> 'key', v_market ->> 'key', v_outcome ->> 'selection',
                  (v_outcome ->> 'price')::numeric, v_provider,
                  coalesce((v_market ->> 'last_update')::timestamptz, v_observed),
                  v_observed, v_observed, p_run_id)
          on conflict (event_id, bookmaker, market, selection, event_time) do update
            set observed_at = greatest(public.odds_snapshots.observed_at, excluded.observed_at)
          returning (xmax = 0) into v_new;
          if v_new then v_inserted := v_inserted + 1; else v_confirmed := v_confirmed + 1; end if;
        end loop;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object(
    'competition_id', v_comp_id,
    'events', v_events,
    'matched', v_matched,
    'snapshots_inserted', v_inserted,
    'snapshots_confirmed', v_confirmed,
    'skipped', v_skipped
  );
end;
$$;

-- Alias manuale (per abbinare i nomi delle squadre di fonti diverse): solo Super Admin con 2FA.
create function public.add_team_alias(p_team_id bigint, p_alias text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform app_private.assert_admin_session();
  if not app_private.has_role('SUPER_ADMIN') then
    raise exception 'Solo un Super Admin può aggiungere alias' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'Squadra % inesistente', p_team_id using errcode = '23503';
  end if;
  if p_alias is null or char_length(btrim(p_alias)) not between 1 and 120 then
    raise exception 'Alias non valido' using errcode = '22023';
  end if;
  insert into public.team_aliases (team_id, alias, source)
  values (p_team_id, btrim(p_alias), 'manual')
  returning id into v_id;
  perform app_private.audit('team_alias.added', 'team', p_team_id::text,
                            jsonb_build_object('alias', btrim(p_alias)));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Viste: quote
-- -----------------------------------------------------------------------------

-- Ultima quota per evento, bookmaker, mercato e selezione.
create view public.v_latest_odds
with (security_invoker = true) as
select distinct on (s.event_id, s.bookmaker, s.market, s.selection)
  s.event_id, e.match_id, e.competition_id, s.bookmaker, s.market, s.selection, s.price,
  s.provider, s.event_time, s.observed_at, s.quality
from public.odds_snapshots s
join public.odds_events e on e.id = s.event_id
order by s.event_id, s.bookmaker, s.market, s.selection, s.event_time desc, s.observed_at desc;

-- 1X2 per evento e bookmaker, con margine e probabilità implicite (ADR 0016, proporzionale).
create view public.v_match_odds_h2h
with (security_invoker = true) as
with pivot as (
  select
    lo.event_id, lo.match_id, lo.competition_id, lo.bookmaker, lo.provider,
    max(lo.price) filter (where lo.selection = 'HOME') as home_price,
    max(lo.price) filter (where lo.selection = 'DRAW') as draw_price,
    max(lo.price) filter (where lo.selection = 'AWAY') as away_price,
    min(lo.observed_at) as observed_at,
    max(lo.event_time) as event_time,
    bool_or(lo.quality <> 'OK') as has_quality_issue
  from public.v_latest_odds lo
  where lo.market = 'h2h'
  group by lo.event_id, lo.match_id, lo.competition_id, lo.bookmaker, lo.provider
),
calc as (
  select p.*,
         1 / p.home_price + 1 / p.draw_price + 1 / p.away_price as implied_sum
  from pivot p
  where p.home_price is not null and p.draw_price is not null and p.away_price is not null
)
select
  c.event_id,
  c.match_id,
  c.competition_id,
  e.commence_time,
  e.home_team_name,
  e.away_team_name,
  c.bookmaker,
  b.title as bookmaker_title,
  b.italian_market,
  c.home_price, c.draw_price, c.away_price,
  round(c.implied_sum - 1, 6) as overround,
  round((1 / c.home_price) / c.implied_sum, 6) as home_probability,
  round((1 / c.draw_price) / c.implied_sum, 6) as draw_probability,
  round((1 / c.away_price) / c.implied_sum, 6) as away_probability,
  c.provider,
  c.observed_at,
  c.event_time,
  case when c.has_quality_issue then 'WARNING' else 'OK' end::public.quality_status as quality,
  case
    when r.max_age is null then 'FRESH'
    when c.observed_at >= now() - r.max_age then 'FRESH'
    else 'STALE'
  end::public.freshness_status as freshness
from calc c
join public.odds_events e on e.id = c.event_id
join public.bookmakers b on b.code = c.bookmaker
left join public.source_freshness_rules r on r.provider = c.provider and r.data_kind = 'odds';

-- Migliore quota per esito tra i bookmaker con quote fresche.
create view public.v_best_odds_h2h
with (security_invoker = true) as
select
  o.event_id,
  o.match_id,
  o.competition_id,
  min(o.commence_time) as commence_time,
  min(o.home_team_name) as home_team_name,
  min(o.away_team_name) as away_team_name,
  max(o.home_price) as best_home_price,
  (array_agg(o.bookmaker order by o.home_price desc, o.bookmaker))[1] as best_home_bookmaker,
  max(o.draw_price) as best_draw_price,
  (array_agg(o.bookmaker order by o.draw_price desc, o.bookmaker))[1] as best_draw_bookmaker,
  max(o.away_price) as best_away_price,
  (array_agg(o.bookmaker order by o.away_price desc, o.bookmaker))[1] as best_away_bookmaker,
  count(*)::integer as bookmakers,
  (count(*) filter (where o.italian_market))::integer as italian_bookmakers,
  max(o.observed_at) as observed_at
from public.v_match_odds_h2h o
where o.freshness = 'FRESH'
group by o.event_id, o.match_id, o.competition_id;

-- Copertura reale delle quote per competizione.
create view public.v_odds_coverage
with (security_invoker = true) as
select
  c.id as competition_id,
  c.code as competition_code,
  c.name as competition_name,
  count(distinct e.id)::integer as events,
  (count(distinct e.id) filter (where e.match_id is not null))::integer as matched_events,
  count(distinct s.bookmaker)::integer as bookmakers,
  (count(distinct s.bookmaker) filter (where b.italian_market))::integer as italian_bookmakers,
  max(e.observed_at) as last_observed_at
from public.competitions c
left join public.odds_events e on e.competition_id = c.id
left join public.odds_snapshots s on s.event_id = e.id
left join public.bookmakers b on b.code = s.bookmaker
group by c.id, c.code, c.name;

-- -----------------------------------------------------------------------------
-- Viste: statistiche dai risultati (M2)
-- -----------------------------------------------------------------------------

-- Una riga per squadra e partita conclusa.
create view public.v_team_match_results
with (security_invoker = true) as
select r.match_id, r.competition_id, r.season_id, r.kickoff_at, r.home_team_id as team_id,
       r.away_team_id as opponent_id, true as is_home,
       r.home_score as goals_for, r.away_score as goals_against
from public.v_match_results r
union all
select r.match_id, r.competition_id, r.season_id, r.kickoff_at, r.away_team_id,
       r.home_team_id, false, r.away_score, r.home_score
from public.v_match_results r;

create view public.v_team_season_stats
with (security_invoker = true) as
select
  t.season_id,
  t.competition_id,
  t.team_id,
  tm.name as team_name,
  tm.tla as team_tla,
  count(*)::integer as played,
  (count(*) filter (where t.goals_for > t.goals_against))::integer as won,
  (count(*) filter (where t.goals_for = t.goals_against))::integer as draw,
  (count(*) filter (where t.goals_for < t.goals_against))::integer as lost,
  sum(t.goals_for)::integer as goals_for,
  sum(t.goals_against)::integer as goals_against,
  (3 * count(*) filter (where t.goals_for > t.goals_against)
     + count(*) filter (where t.goals_for = t.goals_against))::integer as points,
  (count(*) filter (where t.is_home))::integer as home_played,
  (count(*) filter (where t.is_home and t.goals_for > t.goals_against))::integer as home_won,
  coalesce(sum(t.goals_for) filter (where t.is_home), 0)::integer as home_goals_for,
  coalesce(sum(t.goals_against) filter (where t.is_home), 0)::integer as home_goals_against,
  (count(*) filter (where not t.is_home))::integer as away_played,
  (count(*) filter (where not t.is_home and t.goals_for > t.goals_against))::integer as away_won,
  coalesce(sum(t.goals_for) filter (where not t.is_home), 0)::integer as away_goals_for,
  coalesce(sum(t.goals_against) filter (where not t.is_home), 0)::integer as away_goals_against,
  (count(*) filter (where t.goals_against = 0))::integer as clean_sheets,
  (count(*) filter (where t.goals_for > 0 and t.goals_against > 0))::integer as both_scored,
  (count(*) filter (where t.goals_for + t.goals_against > 2))::integer as over_2_5
from public.v_team_match_results t
join public.teams tm on tm.id = t.team_id
group by t.season_id, t.competition_id, t.team_id, tm.name, tm.tla;

-- Ultimi 5 risultati per squadra e stagione (dal più recente): V, N, P.
create view public.v_team_form
with (security_invoker = true) as
with ranked as (
  select t.*, row_number() over (partition by t.season_id, t.team_id order by t.kickoff_at desc) as rn
  from public.v_team_match_results t
)
select
  season_id,
  team_id,
  string_agg(
    case when goals_for > goals_against then 'V' when goals_for = goals_against then 'N' else 'P' end,
    '' order by kickoff_at desc
  ) as form,
  max(kickoff_at) as last_match_at
from ranked
where rn <= 5
group by season_id, team_id;

create view public.v_league_season_stats
with (security_invoker = true) as
select
  r.season_id,
  r.competition_id,
  count(*)::integer as matches,
  round(avg(r.home_score + r.away_score), 3) as avg_goals,
  round(avg(r.home_score), 3) as avg_home_goals,
  round(avg(r.away_score), 3) as avg_away_goals,
  round(avg(case when r.home_score > r.away_score then 1 else 0 end), 4) as home_win_rate,
  round(avg(case when r.home_score = r.away_score then 1 else 0 end), 4) as draw_rate,
  round(avg(case when r.home_score < r.away_score then 1 else 0 end), 4) as away_win_rate,
  round(avg(case when r.home_score + r.away_score > 2 then 1 else 0 end), 4) as over_2_5_rate,
  round(avg(case when r.home_score > 0 and r.away_score > 0 then 1 else 0 end), 4) as both_scored_rate,
  min(r.kickoff_at) as first_match_at,
  max(r.kickoff_at) as last_match_at
from public.v_match_results r
group by r.season_id, r.competition_id;

-- -----------------------------------------------------------------------------
-- Salute delle fonti: la freschezza usa il tipo di dato principale del provider
-- -----------------------------------------------------------------------------
create or replace view public.v_source_health
with (security_invoker = true) as
with last_run as (
  select distinct on (provider)
    provider, status, started_at, finished_at, quota_remaining, error_summary
  from public.ingestion_runs
  order by provider, started_at desc, id desc
),
last_success as (
  select provider, max(finished_at) as finished_at
  from public.ingestion_runs
  where status in ('SUCCEEDED', 'PARTIAL')
  group by provider
),
last_24h as (
  select provider,
         count(*)::integer as runs,
         (count(*) filter (where status = 'FAILED'))::integer as failed_runs,
         sum(requests_used)::integer as requests
  from public.ingestion_runs
  where started_at >= now() - interval '24 hours'
  group by provider
),
issues as (
  select provider,
         count(*)::integer as open_issues,
         (count(*) filter (where severity = 'ERROR'))::integer as open_errors
  from public.data_quality_issues
  where status = 'OPEN' and provider is not null
  group by provider
)
select
  p.code as provider,
  p.name,
  p.website,
  p.terms_verified_at,
  p.attribution,
  lr.status as last_run_status,
  lr.started_at as last_run_at,
  lr.error_summary as last_error,
  lr.quota_remaining,
  ls.finished_at as last_success_at,
  coalesce(d.runs, 0) as runs_24h,
  coalesce(d.failed_runs, 0) as failed_runs_24h,
  coalesce(d.requests, 0) as requests_24h,
  coalesce(i.open_issues, 0) as open_issues,
  coalesce(i.open_errors, 0) as open_errors,
  case
    when ls.finished_at is null then null
    when r.max_age is null then 'FRESH'
    when ls.finished_at >= now() - r.max_age then 'FRESH'
    else 'STALE'
  end::public.freshness_status as freshness,
  case
    when lr.provider is null then 'NO_DATA'
    when lr.status = 'FAILED' or coalesce(i.open_errors, 0) > 0 then 'DEGRADED'
    when ls.finished_at is not null and r.max_age is not null
         and ls.finished_at < now() - r.max_age then 'DEGRADED'
    else 'OK'
  end as health
from public.providers p
left join last_run lr on lr.provider = p.code
left join last_success ls on ls.provider = p.code
left join last_24h d on d.provider = p.code
left join issues i on i.provider = p.code
left join public.source_freshness_rules r
  on r.provider = p.code and r.data_kind = p.primary_data_kind;

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table public.bookmakers     enable row level security;
alter table public.markets        enable row level security;
alter table public.odds_events    enable row level security;
alter table public.odds_snapshots enable row level security;

revoke all on
  public.bookmakers, public.markets, public.odds_events, public.odds_snapshots,
  public.v_latest_odds, public.v_match_odds_h2h, public.v_best_odds_h2h, public.v_odds_coverage,
  public.v_team_match_results, public.v_team_season_stats, public.v_team_form,
  public.v_league_season_stats
from public, anon, authenticated;

grant select on
  public.bookmakers, public.markets, public.odds_events, public.odds_snapshots,
  public.v_latest_odds, public.v_match_odds_h2h, public.v_best_odds_h2h, public.v_odds_coverage,
  public.v_team_match_results, public.v_team_season_stats, public.v_team_form,
  public.v_league_season_stats
to authenticated;

grant all on public.bookmakers, public.markets, public.odds_events, public.odds_snapshots
  to service_role;
grant select on
  public.v_latest_odds, public.v_match_odds_h2h, public.v_best_odds_h2h, public.v_odds_coverage,
  public.v_team_match_results, public.v_team_season_stats, public.v_team_form,
  public.v_league_season_stats
to service_role;

create policy bookmakers_read on public.bookmakers for select to authenticated
  using (app_private.is_active_user());
create policy markets_read on public.markets for select to authenticated
  using (app_private.is_active_user());
create policy odds_events_read on public.odds_events for select to authenticated
  using (app_private.is_active_user());
create policy odds_snapshots_read on public.odds_snapshots for select to authenticated
  using (app_private.is_active_user());

revoke execute on function app_private.normalize_team_name(text) from public, anon, authenticated;
revoke execute on function app_private.team_by_alias(text) from public, anon, authenticated;
grant execute on function app_private.normalize_team_name(text) to service_role;
grant execute on function app_private.team_by_alias(text) to service_role;

revoke execute on function public.ingest_odds_batch(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_odds_batch(bigint, jsonb) to service_role;

revoke execute on function public.add_team_alias(bigint, text) from public, anon;
grant execute on function public.add_team_alias(bigint, text) to authenticated;
