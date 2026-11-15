-- =============================================================================
-- PREDICTRA — M4 corsia 0: versioni dei modelli, previsioni, backtest (contratto)
-- =============================================================================
-- Decisioni: docs/decisions/0020-versioning-previsioni.md, 0021-modelli-v1.md,
--            0022-confidence-score.md
-- Dizionario: docs/data-dictionary/predictions.md
--
-- Principi:
--  * le probabilità vengono solo dai modelli quantitativi (regola 5 di CLAUDE.md);
--  * versioni, previsioni, matrici e backtest sono immutabili;
--  * anti-leakage: nessuna previsione con dati (as_of) successivi al calcio d'inizio;
--  * lettura per utenti attivi; scrittura solo dal motore (service_role) tramite
--    funzioni; attivazione di un modello solo da Super Admin (models.manage) con 2FA.
-- =============================================================================

create type public.model_status as enum ('CANDIDATE', 'ACTIVE', 'RETIRED');

-- -----------------------------------------------------------------------------
-- Versioni dei modelli
-- -----------------------------------------------------------------------------
create table public.model_versions (
  id                     bigint generated always as identity primary key,
  model_key              text not null check (model_key in ('baseline', 'elo', 'poisson', 'dixon_coles')),
  version                text not null check (version ~ '^[A-Za-z0-9._-]{1,40}$'),
  code_commit            text not null check (code_commit ~ '^[0-9a-f]{7,40}$'),
  parameters             jsonb not null check (jsonb_typeof(parameters) = 'object'),
  training_window_start  timestamptz not null,
  training_window_end    timestamptz not null,
  training_data_hash     text not null check (training_data_hash ~ '^[0-9a-f]{64}$'),
  training_matches       integer not null check (training_matches > 0),
  status                 public.model_status not null default 'CANDIDATE',
  notes                  text check (notes is null or char_length(notes) <= 2000),
  created_at             timestamptz not null default now(),
  activated_at           timestamptz,
  activated_by           uuid references public.profiles (id) on delete set null,
  retired_at             timestamptz,
  constraint model_versions_unique unique (model_key, version),
  constraint model_versions_window check (training_window_end >= training_window_start),
  constraint model_versions_active_consistency
    check (status <> 'ACTIVE' or activated_at is not null)
);
-- Al più una versione attiva in ogni momento (ADR 0021 §4).
create unique index model_versions_one_active on public.model_versions ((true)) where status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- Esecuzioni del motore
-- -----------------------------------------------------------------------------
create table public.prediction_runs (
  id                   bigint generated always as identity primary key,
  model_version_id     bigint not null references public.model_versions (id),
  status               public.ingestion_run_status not null default 'RUNNING',
  triggered_by         text not null default 'schedule' check (triggered_by in ('schedule', 'manual', 'backtest')),
  code_commit          text not null check (code_commit ~ '^[0-9a-f]{7,40}$'),
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  matches_scored       integer not null default 0 check (matches_scored >= 0),
  predictions_written  integer not null default 0 check (predictions_written >= 0),
  error_summary        text check (error_summary is null or char_length(error_summary) <= 2000),
  constraint prediction_runs_finished_consistency check ((status = 'RUNNING') = (finished_at is null)),
  constraint prediction_runs_finished_after_start check (finished_at is null or finished_at >= started_at)
);
create index prediction_runs_started_idx on public.prediction_runs (started_at desc);

-- -----------------------------------------------------------------------------
-- Previsioni, matrici dei risultati esatti, backtest
-- -----------------------------------------------------------------------------
create table public.predictions (
  id                 bigint generated always as identity primary key,
  match_id           bigint not null references public.matches (id) on delete restrict,
  model_version_id   bigint not null references public.model_versions (id),
  prediction_run_id  bigint not null references public.prediction_runs (id),
  market             text not null check (market in (
                       '1X2', 'DOUBLE_CHANCE', 'DNB', 'TOTAL_GOALS', 'BTTS', 'TEAM_GOALS',
                       'CORRECT_SCORE', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP')),
  line               numeric(5, 2) check (line is null or (line * 2) = trunc(line * 2)),
  selection          text not null check (selection ~ '^[A-Z0-9_-]{1,20}$'),
  probability        numeric(10, 8) not null check (probability between 0 and 1),
  push_probability   numeric(10, 8) check (push_probability is null or push_probability between 0 and 1),
  confidence_score   numeric(5, 4) not null check (confidence_score between 0 and 1),
  explanation        jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  features_hash      text not null check (features_hash ~ '^[0-9a-f]{64}$'),
  -- Istante dei dati usati: mai successivo al calcio d'inizio (trigger).
  as_of              timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint predictions_probability_total
    check (probability + coalesce(push_probability, 0) <= 1.000001),
  constraint predictions_line_markets
    check ((market in ('TOTAL_GOALS', 'TEAM_GOALS', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP')) = (line is not null))
);
create unique index predictions_unique
  on public.predictions (match_id, model_version_id, market, line, selection, as_of) nulls not distinct;
create index predictions_match_idx on public.predictions (match_id, model_version_id, as_of desc);

create table public.prediction_score_matrices (
  id                 bigint generated always as identity primary key,
  match_id           bigint not null references public.matches (id) on delete restrict,
  model_version_id   bigint not null references public.model_versions (id),
  prediction_run_id  bigint not null references public.prediction_runs (id),
  as_of              timestamptz not null,
  lambda_home        numeric(8, 5) not null check (lambda_home > 0),
  lambda_away        numeric(8, 5) not null check (lambda_away > 0),
  rho                numeric(8, 5),
  max_goals          smallint not null check (max_goals between 1 and 15),
  -- matrix[h][a] = probabilità del risultato h-a, per h, a da 0 a max_goals.
  matrix             jsonb not null check (jsonb_typeof(matrix) = 'array'),
  created_at         timestamptz not null default now(),
  constraint prediction_score_matrices_size check (jsonb_array_length(matrix) = max_goals + 1),
  constraint prediction_score_matrices_unique unique (match_id, model_version_id, as_of)
);

create table public.backtests (
  id                          bigint generated always as identity primary key,
  model_version_id            bigint not null references public.model_versions (id),
  baseline_model_version_id   bigint references public.model_versions (id),
  method                      text not null default 'walk_forward' check (method in ('walk_forward')),
  market                      text not null default '1X2' check (market = '1X2'),
  window_start                timestamptz not null,
  window_end                  timestamptz not null,
  matches                     integer not null check (matches > 0),
  brier                       numeric(10, 6) not null check (brier >= 0),
  log_loss                    numeric(10, 6) not null check (log_loss >= 0),
  ece                         numeric(10, 6) check (ece is null or ece >= 0),
  baseline_brier              numeric(10, 6) check (baseline_brier is null or baseline_brier >= 0),
  baseline_log_loss           numeric(10, 6) check (baseline_log_loss is null or baseline_log_loss >= 0),
  -- Curva di calibrazione: [{bin_low, bin_high, predicted, observed, count}, ...]
  calibration                 jsonb not null default '[]'::jsonb check (jsonb_typeof(calibration) = 'array'),
  code_commit                 text not null check (code_commit ~ '^[0-9a-f]{7,40}$'),
  created_at                  timestamptz not null default now(),
  constraint backtests_window check (window_end >= window_start),
  constraint backtests_baseline_pair
    check ((baseline_brier is null) = (baseline_log_loss is null))
);
create index backtests_model_idx on public.backtests (model_version_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Trigger: immutabilità e anti-leakage
-- -----------------------------------------------------------------------------
create function app_private.forbid_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'La tabella % è immutabile', tg_table_name using errcode = '42501';
end;
$$;

create trigger predictions_immutable before update or delete on public.predictions
  for each row execute function app_private.forbid_mutation();
create trigger predictions_no_truncate before truncate on public.predictions
  for each statement execute function app_private.forbid_mutation();
create trigger prediction_score_matrices_immutable before update or delete on public.prediction_score_matrices
  for each row execute function app_private.forbid_mutation();
create trigger backtests_immutable before update or delete on public.backtests
  for each row execute function app_private.forbid_mutation();

-- Di una versione cambiano solo stato e campi di attivazione.
create function app_private.protect_model_version()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Le versioni dei modelli non si cancellano' using errcode = '42501';
  end if;
  if (new.model_key, new.version, new.code_commit, new.parameters, new.training_window_start,
      new.training_window_end, new.training_data_hash, new.training_matches, new.created_at)
     is distinct from
     (old.model_key, old.version, old.code_commit, old.parameters, old.training_window_start,
      old.training_window_end, old.training_data_hash, old.training_matches, old.created_at) then
    raise exception 'Una versione di modello è immutabile: si crea una versione nuova' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger model_versions_protect before update or delete on public.model_versions
  for each row execute function app_private.protect_model_version();

-- Anti-leakage: i dati di una previsione non possono essere successivi al calcio d'inizio.
create function app_private.check_prediction_as_of()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_kickoff timestamptz;
begin
  select kickoff_at into v_kickoff from public.matches where id = new.match_id;
  if v_kickoff is null then
    raise exception 'Partita % inesistente', new.match_id using errcode = '23503';
  end if;
  if new.as_of > v_kickoff then
    raise exception 'Leakage: dati del % successivi al calcio d''inizio (%) della partita %',
      new.as_of, v_kickoff, new.match_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger predictions_as_of before insert on public.predictions
  for each row execute function app_private.check_prediction_as_of();
create trigger prediction_score_matrices_as_of before insert on public.prediction_score_matrices
  for each row execute function app_private.check_prediction_as_of();

-- -----------------------------------------------------------------------------
-- Funzioni per il motore (service_role)
-- -----------------------------------------------------------------------------

-- Storico per l'addestramento: solo partite concluse prima di p_as_of (ADR 0020 §4).
create function public.training_results(p_as_of timestamptz)
returns setof public.v_match_results
language sql stable set search_path = ''
as $$
  select * from public.v_match_results where kickoff_at < p_as_of order by kickoff_at, match_id;
$$;

-- Registra una versione; se esiste già con gli stessi dati e codice restituisce la stessa.
create function public.register_model_version(p jsonb)
returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
  v_hash text;
  v_commit text;
begin
  select id, training_data_hash, code_commit into v_id, v_hash, v_commit
  from public.model_versions
  where model_key = p ->> 'model_key' and version = p ->> 'version';
  if v_id is not null then
    if v_hash = p ->> 'training_data_hash' and v_commit = p ->> 'code_commit' then
      return v_id;
    end if;
    raise exception 'Versione %/% già registrata con dati o codice diversi',
      p ->> 'model_key', p ->> 'version' using errcode = '23505';
  end if;
  insert into public.model_versions
    (model_key, version, code_commit, parameters, training_window_start, training_window_end,
     training_data_hash, training_matches, notes)
  values (p ->> 'model_key', p ->> 'version', p ->> 'code_commit', coalesce(p -> 'parameters', '{}'::jsonb),
          (p ->> 'training_window_start')::timestamptz, (p ->> 'training_window_end')::timestamptz,
          p ->> 'training_data_hash', (p ->> 'training_matches')::integer, p ->> 'notes')
  returning id into v_id;
  return v_id;
end;
$$;

create function public.start_prediction_run(
  p_model_version_id bigint, p_code_commit text, p_triggered_by text default 'schedule'
) returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.model_versions where id = p_model_version_id) then
    raise exception 'Versione di modello % inesistente', p_model_version_id using errcode = '23503';
  end if;
  -- Esecuzioni rimaste aperte da più di 1 ora: chiuse come fallite.
  update public.prediction_runs
  set status = 'FAILED', finished_at = now(),
      error_summary = 'Esecuzione interrotta: chiusa automaticamente dopo 1 ora'
  where status = 'RUNNING' and started_at < now() - interval '1 hour';
  insert into public.prediction_runs (model_version_id, code_commit, triggered_by)
  values (p_model_version_id, p_code_commit, p_triggered_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- p_batch: {"predictions": [{match_id, market, line, selection, probability, push_probability,
--            confidence_score, explanation, features_hash, as_of}],
--           "score_matrices": [{match_id, as_of, lambda_home, lambda_away, rho, max_goals, matrix}]}
-- Rieseguire lo stesso lotto non duplica nulla.
create function public.record_predictions(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_model bigint;
  v_predictions integer;
  v_matrices integer;
begin
  select model_version_id into v_model
  from public.prediction_runs where id = p_run_id and status = 'RUNNING';
  if v_model is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
  end if;

  insert into public.predictions
    (match_id, model_version_id, prediction_run_id, market, line, selection, probability,
     push_probability, confidence_score, explanation, features_hash, as_of)
  select (e ->> 'match_id')::bigint, v_model, p_run_id, e ->> 'market', (e ->> 'line')::numeric,
         e ->> 'selection', (e ->> 'probability')::numeric, (e ->> 'push_probability')::numeric,
         (e ->> 'confidence_score')::numeric, coalesce(e -> 'explanation', '{}'::jsonb),
         e ->> 'features_hash', (e ->> 'as_of')::timestamptz
  from jsonb_array_elements(coalesce(p_batch -> 'predictions', '[]'::jsonb)) as e
  on conflict do nothing;
  get diagnostics v_predictions = row_count;

  insert into public.prediction_score_matrices
    (match_id, model_version_id, prediction_run_id, as_of, lambda_home, lambda_away, rho, max_goals, matrix)
  select (e ->> 'match_id')::bigint, v_model, p_run_id, (e ->> 'as_of')::timestamptz,
         (e ->> 'lambda_home')::numeric, (e ->> 'lambda_away')::numeric, (e ->> 'rho')::numeric,
         (e ->> 'max_goals')::smallint, e -> 'matrix'
  from jsonb_array_elements(coalesce(p_batch -> 'score_matrices', '[]'::jsonb)) as e
  on conflict do nothing;
  get diagnostics v_matrices = row_count;

  update public.prediction_runs
  set predictions_written = predictions_written + v_predictions
  where id = p_run_id;

  return jsonb_build_object('predictions', v_predictions, 'score_matrices', v_matrices);
end;
$$;

create function public.finish_prediction_run(
  p_run_id bigint, p_status public.ingestion_run_status, p_matches_scored integer default 0,
  p_error_summary text default null
) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_status = 'RUNNING' then
    raise exception 'Lo stato finale non può essere RUNNING' using errcode = '22023';
  end if;
  update public.prediction_runs
  set status = p_status, finished_at = now(), matches_scored = coalesce(p_matches_scored, 0),
      error_summary = left(p_error_summary, 2000)
  where id = p_run_id and status = 'RUNNING';
  if not found then
    raise exception 'Esecuzione % inesistente o già chiusa', p_run_id using errcode = 'P0002';
  end if;
end;
$$;

create function public.record_backtest(p jsonb)
returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.backtests
    (model_version_id, baseline_model_version_id, window_start, window_end, matches, brier,
     log_loss, ece, baseline_brier, baseline_log_loss, calibration, code_commit)
  values ((p ->> 'model_version_id')::bigint, (p ->> 'baseline_model_version_id')::bigint,
          (p ->> 'window_start')::timestamptz, (p ->> 'window_end')::timestamptz,
          (p ->> 'matches')::integer, (p ->> 'brier')::numeric, (p ->> 'log_loss')::numeric,
          (p ->> 'ece')::numeric, (p ->> 'baseline_brier')::numeric,
          (p ->> 'baseline_log_loss')::numeric, coalesce(p -> 'calibration', '[]'::jsonb),
          p ->> 'code_commit')
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attivazione di un modello: Super Admin (models.manage in roles.ts) con 2FA
-- -----------------------------------------------------------------------------
create function public.set_active_model_version(p_model_version_id bigint)
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
  update public.model_versions
  set status = 'RETIRED', retired_at = now()
  where id = v_previous;
  update public.model_versions
  set status = 'ACTIVE', activated_at = now(), activated_by = auth.uid(), retired_at = null
  where id = p_model_version_id;

  perform app_private.audit('model.activated', 'model_version', p_model_version_id::text,
                            jsonb_build_object('previous', v_previous));
end;
$$;

-- -----------------------------------------------------------------------------
-- Viste
-- -----------------------------------------------------------------------------

-- Ultima previsione del modello attivo per partita, mercato, linea e selezione.
create view public.v_active_predictions
with (security_invoker = true) as
select distinct on (p.match_id, p.market, p.line, p.selection)
  p.match_id,
  m.kickoff_at,
  m.status as match_status,
  m.competition_id,
  m.season_id,
  hm.name as home_team_name,
  aw.name as away_team_name,
  p.market,
  p.line,
  p.selection,
  p.probability,
  p.push_probability,
  p.confidence_score,
  p.explanation,
  p.as_of,
  p.created_at,
  mv.id as model_version_id,
  mv.model_key,
  mv.version as model_version
from public.predictions p
join public.model_versions mv on mv.id = p.model_version_id and mv.status = 'ACTIVE'
join public.matches m on m.id = p.match_id
join public.teams hm on hm.id = m.home_team_id
join public.teams aw on aw.id = m.away_team_id
order by p.match_id, p.market, p.line, p.selection, p.as_of desc, p.id desc;

-- Versioni con l'ultimo backtest e il confronto con la baseline.
create view public.v_model_versions_summary
with (security_invoker = true) as
select
  mv.id as model_version_id,
  mv.model_key,
  mv.version,
  mv.status,
  mv.code_commit,
  mv.training_window_start,
  mv.training_window_end,
  mv.training_matches,
  mv.created_at,
  mv.activated_at,
  b.id as backtest_id,
  b.window_start as backtest_window_start,
  b.window_end as backtest_window_end,
  b.matches as backtest_matches,
  b.brier,
  b.log_loss,
  b.ece,
  b.baseline_brier,
  b.baseline_log_loss,
  case when b.baseline_brier is not null then b.brier < b.baseline_brier and b.log_loss < b.baseline_log_loss end
    as beats_baseline,
  b.calibration
from public.model_versions mv
left join lateral (
  select * from public.backtests bt
  where bt.model_version_id = mv.id
  order by bt.created_at desc, bt.id desc
  limit 1
) b on true;

-- -----------------------------------------------------------------------------
-- RLS e privilegi
-- -----------------------------------------------------------------------------
alter table public.model_versions            enable row level security;
alter table public.prediction_runs           enable row level security;
alter table public.predictions               enable row level security;
alter table public.prediction_score_matrices enable row level security;
alter table public.backtests                 enable row level security;

revoke all on
  public.model_versions, public.prediction_runs, public.predictions,
  public.prediction_score_matrices, public.backtests,
  public.v_active_predictions, public.v_model_versions_summary
from public, anon, authenticated;

grant select on
  public.model_versions, public.prediction_runs, public.predictions,
  public.prediction_score_matrices, public.backtests,
  public.v_active_predictions, public.v_model_versions_summary
to authenticated;

grant select, insert, update on
  public.model_versions, public.prediction_runs, public.predictions,
  public.prediction_score_matrices, public.backtests
to service_role;
grant select on public.v_active_predictions, public.v_model_versions_summary to service_role;

create policy model_versions_read on public.model_versions for select to authenticated
  using (app_private.is_active_user());
create policy prediction_runs_read on public.prediction_runs for select to authenticated
  using (app_private.is_active_user());
create policy predictions_read on public.predictions for select to authenticated
  using (app_private.is_active_user());
create policy prediction_score_matrices_read on public.prediction_score_matrices for select to authenticated
  using (app_private.is_active_user());
create policy backtests_read on public.backtests for select to authenticated
  using (app_private.is_active_user());

revoke execute on function app_private.forbid_mutation() from public, anon, authenticated;
revoke execute on function app_private.protect_model_version() from public, anon, authenticated;
revoke execute on function app_private.check_prediction_as_of() from public, anon, authenticated;

revoke execute on function public.training_results(timestamptz) from public, anon;
grant execute on function public.training_results(timestamptz) to authenticated, service_role;

revoke execute on function public.register_model_version(jsonb) from public, anon, authenticated;
revoke execute on function public.start_prediction_run(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.record_predictions(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_prediction_run(bigint, public.ingestion_run_status, integer, text)
  from public, anon, authenticated;
revoke execute on function public.record_backtest(jsonb) from public, anon, authenticated;
grant execute on function public.register_model_version(jsonb) to service_role;
grant execute on function public.start_prediction_run(bigint, text, text) to service_role;
grant execute on function public.record_predictions(bigint, jsonb) to service_role;
grant execute on function public.finish_prediction_run(bigint, public.ingestion_run_status, integer, text)
  to service_role;
grant execute on function public.record_backtest(jsonb) to service_role;

revoke execute on function public.set_active_model_version(bigint) from public, anon;
grant execute on function public.set_active_model_version(bigint) to authenticated;
