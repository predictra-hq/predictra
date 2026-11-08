-- =============================================================================
-- PREDICTRA — M2 corsia 0: modello canonico del calcio (contratto)
-- =============================================================================
-- Decisioni: docs/decisions/0010-modello-dati-calcio.md
-- Dizionario: docs/data-dictionary/football.md
--
-- Principi:
--  * Entità canoniche (competizioni, stagioni, squadre, partite, classifiche)
--    indipendenti dal provider; gli ID dei provider stanno in
--    provider_entity_map.
--  * Ogni riga di dato esterno conserva provider, observed_at, event_time e
--    qualità; la licenza si ricava dal provider (tabella providers).
--  * Lettura: solo utenti autenticati con account attivo (RLS).
--    Scrittura: solo i job di ingestion con la chiave secret (service_role).
--  * Le viste usano security_invoker: applicano la RLS di chi le interroga.
--  * Nessun dato calcistico viene inserito da questa migrazione: solo il
--    catalogo dei provider e le soglie di freschezza (ADR 0010).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------
create type public.quality_status as enum ('OK', 'WARNING', 'ERROR');
create type public.freshness_status as enum ('FRESH', 'STALE');
create type public.competition_type as enum ('LEAGUE', 'CUP', 'LEAGUE_CUP', 'PLAYOFFS');
create type public.match_status as enum (
  'SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'SUSPENDED', 'CANCELLED', 'ABANDONED', 'AWARDED'
);
create type public.score_duration as enum ('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT');
create type public.standing_type as enum ('TOTAL', 'HOME', 'AWAY');
create type public.football_entity_type as enum ('competition', 'season', 'team', 'match');
create type public.football_data_kind as enum ('competitions', 'teams', 'matches', 'standings');
create type public.ingestion_run_status as enum ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
create type public.issue_severity as enum ('INFO', 'WARNING', 'ERROR');
create type public.issue_status as enum ('OPEN', 'RESOLVED', 'IGNORED');

-- -----------------------------------------------------------------------------
-- Provider e regole di freschezza
-- -----------------------------------------------------------------------------

-- Catalogo dei provider. Termini e licenze: docs/data-sources/.
create table public.providers (
  code               text primary key check (code ~ '^[a-z0-9-]{2,40}$'),
  name               text not null,
  website            text not null check (website ~ '^https://'),
  terms_url          text check (terms_url is null or terms_url ~ '^https://'),
  -- null = termini d'uso non ancora verificati: i job non devono usare il provider.
  terms_verified_at  date,
  licence_summary    text not null,
  attribution        text,
  docs_path          text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

insert into public.providers
  (code, name, website, terms_url, terms_verified_at, licence_summary, attribution, docs_path)
values
  ('football-data-org', 'football-data.org', 'https://www.football-data.org',
   'https://www.football-data.org/about', date '2026-11-07',
   'Piano Free: 12 competizioni, 10 richieste/minuto, punteggi e calendari in ritardo. Chiave legata a una sola applicazione; attribuzione richiesta; loghi esclusi.',
   'Football data provided by the Football-Data.org API',
   'docs/data-sources/football-data-org.md'),
  ('api-football', 'API-Football (API-SPORTS)', 'https://www.api-football.com',
   null, null,
   'Termini d''uso NON VERIFICATI: il sito blocca la lettura automatica. Da leggere a mano prima dell''uso (docs/data-sources/api-football.md).',
   null,
   'docs/data-sources/api-football.md');

-- Oltre max_age dall'ultima osservazione un dato è STALE.
-- max_age null = il dato non scade (es. storico chiuso).
create table public.source_freshness_rules (
  provider   text not null references public.providers (code) on delete cascade,
  data_kind  public.football_data_kind not null,
  max_age    interval check (max_age is null or max_age > interval '0'),
  primary key (provider, data_kind)
);

insert into public.source_freshness_rules (provider, data_kind, max_age) values
  ('football-data-org', 'competitions', interval '30 days'),
  ('football-data-org', 'teams',        interval '30 days'),
  ('football-data-org', 'matches',      interval '6 hours'),
  ('football-data-org', 'standings',    interval '24 hours'),
  ('api-football',      'competitions', null),
  ('api-football',      'teams',        null),
  ('api-football',      'matches',      null),
  ('api-football',      'standings',    null);

-- -----------------------------------------------------------------------------
-- Esecuzioni dei job di ingestion
-- -----------------------------------------------------------------------------
create table public.ingestion_runs (
  id              bigint generated always as identity primary key,
  provider        text not null references public.providers (code),
  job_type        text not null check (job_type ~ '^[a-z0-9_.-]{2,60}$'),
  -- Tipo + entità + finestra temporale (ADR 0003), es. 'SA:2025:matches'.
  window_key      text not null check (char_length(window_key) between 1 and 200),
  status          public.ingestion_run_status not null default 'RUNNING',
  triggered_by    text not null default 'schedule' check (triggered_by in ('schedule', 'manual', 'backfill')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  requests_used   integer not null default 0 check (requests_used >= 0),
  quota_remaining integer check (quota_remaining is null or quota_remaining >= 0),
  rows_upserted   integer not null default 0 check (rows_upserted >= 0),
  error_count     integer not null default 0 check (error_count >= 0),
  -- Messaggio sintetico, mai segreti né risposte complete del provider.
  error_summary   text check (error_summary is null or char_length(error_summary) <= 2000),
  -- Punto di ripresa per i backfill (es. ultima pagina o stagione completata).
  resume_cursor   jsonb check (resume_cursor is null or jsonb_typeof(resume_cursor) = 'object'),
  constraint ingestion_runs_finished_consistency
    check ((status = 'RUNNING') = (finished_at is null)),
  constraint ingestion_runs_finished_after_start
    check (finished_at is null or finished_at >= started_at)
);
-- Al più un'esecuzione in corso per lo stesso lavoro.
create unique index ingestion_runs_one_running
  on public.ingestion_runs (provider, job_type, window_key) where status = 'RUNNING';
create index ingestion_runs_provider_started_idx on public.ingestion_runs (provider, started_at desc);

-- -----------------------------------------------------------------------------
-- Entità canoniche
-- -----------------------------------------------------------------------------
create table public.competitions (
  id              bigint generated always as identity primary key,
  name            text not null check (char_length(name) between 1 and 120),
  code            text check (code is null or code ~ '^[A-Z0-9]{2,10}$'),
  type            public.competition_type not null,
  area_name       text,
  area_code       text check (area_code is null or area_code ~ '^[A-Z]{2,3}$'),
  provider        text not null references public.providers (code),
  observed_at     timestamptz not null,
  event_time      timestamptz,
  quality         public.quality_status not null default 'OK',
  ingestion_run_id bigint references public.ingestion_runs (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index competitions_code_key on public.competitions (code) where code is not null;

create table public.seasons (
  id              bigint generated always as identity primary key,
  competition_id  bigint not null references public.competitions (id) on delete restrict,
  label           text not null check (label ~ '^[0-9]{4}(/[0-9]{2})?$'),
  start_date      date not null,
  end_date        date not null,
  current_matchday integer check (current_matchday is null or current_matchday > 0),
  provider        text not null references public.providers (code),
  observed_at     timestamptz not null,
  event_time      timestamptz,
  quality         public.quality_status not null default 'OK',
  ingestion_run_id bigint references public.ingestion_runs (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint seasons_dates check (end_date >= start_date),
  constraint seasons_unique_start unique (competition_id, start_date)
);

create table public.teams (
  id              bigint generated always as identity primary key,
  name            text not null check (char_length(name) between 1 and 120),
  short_name      text check (short_name is null or char_length(short_name) between 1 and 60),
  tla             text check (tla is null or tla ~ '^[A-Z0-9]{2,5}$'),
  area_code       text check (area_code is null or area_code ~ '^[A-Z]{2,3}$'),
  provider        text not null references public.providers (code),
  observed_at     timestamptz not null,
  event_time      timestamptz,
  quality         public.quality_status not null default 'OK',
  ingestion_run_id bigint references public.ingestion_runs (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index teams_name_idx on public.teams (lower(name));

-- Nomi alternativi di una squadra, per abbinare dati di fonti diverse (M3).
-- source = codice provider oppure 'manual'.
create table public.team_aliases (
  id               bigint generated always as identity primary key,
  team_id          bigint not null references public.teams (id) on delete cascade,
  alias            text not null check (char_length(alias) between 1 and 120),
  normalized_alias text generated always as (lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) stored,
  source           text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  created_at       timestamptz not null default now(),
  constraint team_aliases_unique unique (source, normalized_alias)
);
create index team_aliases_team_idx on public.team_aliases (team_id);
create index team_aliases_normalized_idx on public.team_aliases (normalized_alias);

create table public.matches (
  id               bigint generated always as identity primary key,
  competition_id   bigint not null references public.competitions (id) on delete restrict,
  season_id        bigint not null references public.seasons (id) on delete restrict,
  matchday         integer check (matchday is null or matchday > 0),
  stage            text check (stage is null or char_length(stage) <= 60),
  group_name       text check (group_name is null or char_length(group_name) <= 60),
  kickoff_at       timestamptz not null,
  status           public.match_status not null,
  home_team_id     bigint not null references public.teams (id) on delete restrict,
  away_team_id     bigint not null references public.teams (id) on delete restrict,
  -- Risultato finale (dopo eventuali supplementari) e del primo tempo.
  home_score       smallint check (home_score is null or home_score >= 0),
  away_score       smallint check (away_score is null or away_score >= 0),
  home_score_ht    smallint check (home_score_ht is null or home_score_ht >= 0),
  away_score_ht    smallint check (away_score_ht is null or away_score_ht >= 0),
  score_duration   public.score_duration,
  provider         text not null references public.providers (code),
  observed_at      timestamptz not null,
  -- Ultimo aggiornamento dichiarato dal provider; in sua assenza il calcio d'inizio.
  event_time       timestamptz not null,
  quality          public.quality_status not null default 'OK',
  ingestion_run_id bigint references public.ingestion_runs (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_score_pair check ((home_score is null) = (away_score is null)),
  constraint matches_score_ht_pair check ((home_score_ht is null) = (away_score_ht is null))
);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_competition_kickoff_idx on public.matches (competition_id, kickoff_at);
create index matches_season_matchday_idx on public.matches (season_id, matchday);
create index matches_home_team_idx on public.matches (home_team_id, kickoff_at);
create index matches_away_team_idx on public.matches (away_team_id, kickoff_at);

-- Fotografie della classifica: ogni osservazione è una nuova riga.
create table public.standings (
  id               bigint generated always as identity primary key,
  competition_id   bigint not null references public.competitions (id) on delete restrict,
  season_id        bigint not null references public.seasons (id) on delete restrict,
  team_id          bigint not null references public.teams (id) on delete restrict,
  standing_type    public.standing_type not null default 'TOTAL',
  stage            text not null default 'REGULAR_SEASON' check (char_length(stage) <= 60),
  group_name       text not null default '' check (char_length(group_name) <= 60),
  position         smallint not null check (position > 0),
  played           smallint not null check (played >= 0),
  won              smallint not null check (won >= 0),
  draw             smallint not null check (draw >= 0),
  lost             smallint not null check (lost >= 0),
  goals_for        smallint not null check (goals_for >= 0),
  goals_against    smallint not null check (goals_against >= 0),
  points           smallint not null,
  provider         text not null references public.providers (code),
  observed_at      timestamptz not null,
  event_time       timestamptz not null,
  quality          public.quality_status not null default 'OK',
  ingestion_run_id bigint references public.ingestion_runs (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint standings_snapshot_unique
    unique (season_id, standing_type, stage, group_name, team_id, observed_at)
);
create index standings_season_observed_idx on public.standings (season_id, observed_at desc);

-- -----------------------------------------------------------------------------
-- Mapping verso gli ID dei provider
-- -----------------------------------------------------------------------------
create table public.provider_entity_map (
  provider            text not null references public.providers (code),
  entity_type         public.football_entity_type not null,
  provider_entity_id  text not null check (char_length(provider_entity_id) between 1 and 100),
  entity_id           bigint not null,
  observed_at         timestamptz not null default now(),
  primary key (provider, entity_type, provider_entity_id),
  constraint provider_entity_map_one_per_entity unique (provider, entity_type, entity_id)
);
create index provider_entity_map_entity_idx on public.provider_entity_map (entity_type, entity_id);

-- entity_id è polimorfico: il trigger verifica che l'entità esista.
create function app_private.check_provider_entity()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_exists boolean;
begin
  v_exists := case new.entity_type
    when 'competition' then exists (select 1 from public.competitions where id = new.entity_id)
    when 'season'      then exists (select 1 from public.seasons where id = new.entity_id)
    when 'team'        then exists (select 1 from public.teams where id = new.entity_id)
    when 'match'       then exists (select 1 from public.matches where id = new.entity_id)
  end;
  if not v_exists then
    raise exception 'Entità % con id % inesistente', new.entity_type, new.entity_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger provider_entity_map_check
  before insert or update on public.provider_entity_map
  for each row execute function app_private.check_provider_entity();

-- -----------------------------------------------------------------------------
-- Problemi di qualità dei dati
-- -----------------------------------------------------------------------------
create table public.data_quality_issues (
  id                  bigint generated always as identity primary key,
  provider            text references public.providers (code),
  entity_type         public.football_entity_type,
  entity_id           bigint,
  provider_entity_id  text,
  -- Codice del controllo, es. 'match.score_missing', 'team.unmapped'.
  check_code          text not null check (check_code ~ '^[a-z0-9_.]{3,80}$'),
  severity            public.issue_severity not null,
  status              public.issue_status not null default 'OPEN',
  details             jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  resolved_at         timestamptz,
  ingestion_run_id    bigint references public.ingestion_runs (id) on delete set null,
  constraint data_quality_issues_resolution
    check ((status = 'OPEN') = (resolved_at is null)),
  constraint data_quality_issues_seen_order check (last_seen_at >= first_seen_at)
);
-- Un solo problema aperto per controllo ed entità: i job aggiornano last_seen_at.
create unique index data_quality_issues_one_open
  on public.data_quality_issues (check_code, provider, entity_type, entity_id, provider_entity_id)
  nulls not distinct
  where status = 'OPEN';
create index data_quality_issues_status_idx on public.data_quality_issues (status, severity, last_seen_at desc);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create trigger providers_touch before update on public.providers
  for each row execute function app_private.touch_updated_at();
create trigger competitions_touch before update on public.competitions
  for each row execute function app_private.touch_updated_at();
create trigger seasons_touch before update on public.seasons
  for each row execute function app_private.touch_updated_at();
create trigger teams_touch before update on public.teams
  for each row execute function app_private.touch_updated_at();
create trigger matches_touch before update on public.matches
  for each row execute function app_private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Viste per l'interfaccia (contatto tra corsia A e corsia B)
-- -----------------------------------------------------------------------------

-- Una riga per partita, con provenienza, qualità e freschezza.
-- Una partita conclusa da più di 72 ore non scade più (il risultato è stabile).
create view public.v_match_center
with (security_invoker = true) as
select
  m.id                    as match_id,
  m.kickoff_at,
  m.status,
  m.matchday,
  m.stage,
  m.group_name,
  c.id                    as competition_id,
  c.code                  as competition_code,
  c.name                  as competition_name,
  c.area_name,
  s.id                    as season_id,
  s.label                 as season_label,
  hm.id                   as home_team_id,
  hm.name                 as home_team_name,
  hm.short_name           as home_team_short_name,
  hm.tla                  as home_team_tla,
  aw.id                   as away_team_id,
  aw.name                 as away_team_name,
  aw.short_name           as away_team_short_name,
  aw.tla                  as away_team_tla,
  m.home_score,
  m.away_score,
  m.home_score_ht,
  m.away_score_ht,
  m.score_duration,
  m.provider,
  p.name                  as provider_name,
  pem.provider_entity_id  as provider_match_id,
  m.observed_at,
  m.event_time,
  m.quality,
  case
    when m.status in ('FINISHED', 'AWARDED', 'CANCELLED')
         and m.kickoff_at < now() - interval '72 hours' then 'FRESH'
    when r.max_age is null then 'FRESH'
    when m.observed_at >= now() - r.max_age then 'FRESH'
    else 'STALE'
  end::public.freshness_status as freshness,
  (select count(*) from public.data_quality_issues q
    where q.status = 'OPEN' and q.entity_type = 'match' and q.entity_id = m.id)::integer
                          as open_issues
from public.matches m
join public.competitions c on c.id = m.competition_id
join public.seasons s on s.id = m.season_id
join public.teams hm on hm.id = m.home_team_id
join public.teams aw on aw.id = m.away_team_id
join public.providers p on p.code = m.provider
left join public.provider_entity_map pem
  on pem.provider = m.provider and pem.entity_type = 'match' and pem.entity_id = m.id
left join public.source_freshness_rules r
  on r.provider = m.provider and r.data_kind = 'matches';

-- Partite concluse con risultato finale: base per statistiche (M3) e modelli (M4).
-- Filtrare sempre per kickoff_at < istante di riferimento per evitare il leakage.
create view public.v_match_results
with (security_invoker = true) as
select
  m.id as match_id,
  m.competition_id,
  m.season_id,
  m.matchday,
  m.kickoff_at,
  m.home_team_id,
  m.away_team_id,
  m.home_score,
  m.away_score,
  m.home_score_ht,
  m.away_score_ht,
  m.score_duration,
  m.provider,
  m.observed_at,
  m.quality
from public.matches m
where m.status = 'FINISHED'
  and m.home_score is not null
  and m.quality <> 'ERROR';

-- Ultima fotografia disponibile della classifica per stagione.
create view public.v_latest_standings
with (security_invoker = true) as
with latest as (
  select season_id, max(observed_at) as observed_at
  from public.standings
  group by season_id
)
select
  st.competition_id,
  c.name as competition_name,
  st.season_id,
  se.label as season_label,
  st.standing_type,
  st.stage,
  st.group_name,
  st.position,
  st.team_id,
  t.name as team_name,
  t.tla as team_tla,
  st.played, st.won, st.draw, st.lost,
  st.goals_for, st.goals_against,
  (st.goals_for - st.goals_against) as goal_difference,
  st.points,
  st.provider,
  st.observed_at,
  st.event_time,
  st.quality,
  case
    when r.max_age is null then 'FRESH'
    when st.observed_at >= now() - r.max_age then 'FRESH'
    else 'STALE'
  end::public.freshness_status as freshness
from public.standings st
join latest l on l.season_id = st.season_id and l.observed_at = st.observed_at
join public.competitions c on c.id = st.competition_id
join public.seasons se on se.id = st.season_id
join public.teams t on t.id = st.team_id
left join public.source_freshness_rules r
  on r.provider = st.provider and r.data_kind = 'standings';

-- Salute dei provider (pannello Source Intelligence).
create view public.v_source_health
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
  on r.provider = p.code and r.data_kind = 'matches';

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table public.providers              enable row level security;
alter table public.source_freshness_rules enable row level security;
alter table public.ingestion_runs         enable row level security;
alter table public.competitions           enable row level security;
alter table public.seasons                enable row level security;
alter table public.teams                  enable row level security;
alter table public.team_aliases           enable row level security;
alter table public.matches                enable row level security;
alter table public.standings              enable row level security;
alter table public.provider_entity_map    enable row level security;
alter table public.data_quality_issues    enable row level security;

-- I privilegi predefiniti di Supabase concedono tutto ad anon e authenticated:
-- si revocano e si concede solo la lettura agli utenti autenticati.
revoke all on
  public.providers, public.source_freshness_rules, public.ingestion_runs,
  public.competitions, public.seasons, public.teams, public.team_aliases,
  public.matches, public.standings, public.provider_entity_map, public.data_quality_issues,
  public.v_match_center, public.v_match_results, public.v_latest_standings, public.v_source_health
from public, anon, authenticated;

grant select on
  public.providers, public.source_freshness_rules, public.ingestion_runs,
  public.competitions, public.seasons, public.teams, public.team_aliases,
  public.matches, public.standings, public.provider_entity_map, public.data_quality_issues,
  public.v_match_center, public.v_match_results, public.v_latest_standings, public.v_source_health
to authenticated;

-- I job di ingestion usano la chiave secret (service_role, che ignora la RLS).
grant all on
  public.providers, public.source_freshness_rules, public.ingestion_runs,
  public.competitions, public.seasons, public.teams, public.team_aliases,
  public.matches, public.standings, public.provider_entity_map, public.data_quality_issues
to service_role;
grant select on
  public.v_match_center, public.v_match_results, public.v_latest_standings, public.v_source_health
to service_role;

-- Lettura: solo utenti autenticati con account attivo. Nessuna policy di scrittura.
create policy providers_read on public.providers for select to authenticated
  using (app_private.is_active_user());
create policy source_freshness_rules_read on public.source_freshness_rules for select to authenticated
  using (app_private.is_active_user());
create policy ingestion_runs_read on public.ingestion_runs for select to authenticated
  using (app_private.is_active_user());
create policy competitions_read on public.competitions for select to authenticated
  using (app_private.is_active_user());
create policy seasons_read on public.seasons for select to authenticated
  using (app_private.is_active_user());
create policy teams_read on public.teams for select to authenticated
  using (app_private.is_active_user());
create policy team_aliases_read on public.team_aliases for select to authenticated
  using (app_private.is_active_user());
create policy matches_read on public.matches for select to authenticated
  using (app_private.is_active_user());
create policy standings_read on public.standings for select to authenticated
  using (app_private.is_active_user());
create policy provider_entity_map_read on public.provider_entity_map for select to authenticated
  using (app_private.is_active_user());
create policy data_quality_issues_read on public.data_quality_issues for select to authenticated
  using (app_private.is_active_user());

revoke execute on function app_private.check_provider_entity() from public, anon, authenticated;
