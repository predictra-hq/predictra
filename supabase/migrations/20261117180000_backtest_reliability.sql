-- Verifica storica del modello su tutti i mercati principali (ADR 0057).
-- Il motore riempie `reliability` durante il backtest walk-forward: per migliaia di
-- partite passate, rigiocate con le sole partite precedenti, quante giocate dal 70% sono
-- uscite (per mercato, campionato, stagione, settimana e fascia di probabilità), quante
-- volte ha vinto la favorita e quante volte è uscito il risultato esatto più probabile.

alter table public.backtests
  add column reliability jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reliability) = 'object');

create or replace function public.record_backtest(p jsonb)
returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.backtests
    (model_version_id, baseline_model_version_id, window_start, window_end, matches, brier,
     log_loss, ece, baseline_brier, baseline_log_loss, calibration, reliability, code_commit)
  values ((p ->> 'model_version_id')::bigint, (p ->> 'baseline_model_version_id')::bigint,
          (p ->> 'window_start')::timestamptz, (p ->> 'window_end')::timestamptz,
          (p ->> 'matches')::integer, (p ->> 'brier')::numeric, (p ->> 'log_loss')::numeric,
          (p ->> 'ece')::numeric, (p ->> 'baseline_brier')::numeric,
          (p ->> 'baseline_log_loss')::numeric, coalesce(p -> 'calibration', '[]'::jsonb),
          case when jsonb_typeof(p -> 'reliability') = 'object' then p -> 'reliability'
               else '{}'::jsonb end,
          p ->> 'code_commit')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.record_backtest(jsonb) from public, anon, authenticated;
grant execute on function public.record_backtest(jsonb) to service_role;
