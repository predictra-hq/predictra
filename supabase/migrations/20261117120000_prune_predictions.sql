-- =============================================================================
-- M4/M8 — Conservazione delle previsioni (ADR 0041, decisione del 17/11/2026)
-- =============================================================================
-- Il motore riscrive le previsioni delle partite in programma due volte al giorno
-- (circa 7.000 righe a giro): con il piano Free di Supabase (500 MB) il limite sarebbe
-- arrivato in circa tre mesi. Le previsioni superate non servono: verifiche, pagine e
-- backtest usano l'ultima previsione prima del calcio d'inizio, e il backtest del motore
-- si ricalcola dai risultati.
--
-- `prune_predictions` cancella, a blocchi, le previsioni e le matrici dei risultati
-- esatti che sono insieme:
--   - più vecchie di `p_keep_days` giorni;
--   - non le ultime della loro partita, versione del modello, mercato, linea ed esito
--     (per una partita giocata l'ultima è quella prima del calcio d'inizio: resta sempre);
--   - non usate da una proposta del Bet Builder o da una schedina di un utente.
-- Solo `service_role` (il motore a fine giro). Le tabelle restano immutabili per tutti
-- gli altri: il blocco si allenta solo dentro questa funzione, per le sole cancellazioni.
-- =============================================================================

create or replace function app_private.forbid_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Unica eccezione: le cancellazioni fatte da prune_predictions (impostazione locale
  -- alla sua transazione), solo su previsioni e matrici.
  if tg_op = 'DELETE'
     and tg_table_name in ('predictions', 'prediction_score_matrices')
     and current_setting('predictra.pruning', true) = 'on' then
    return old;
  end if;
  raise exception 'La tabella % è immutabile', tg_table_name using errcode = '42501';
end;
$$;

create function public.prune_predictions(p_keep_days integer default 7, p_limit integer default 20000)
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
    select p.id, p.created_at,
      row_number() over (
        partition by p.match_id, p.model_version_id, p.market, p.line, p.selection
        order by p.as_of desc, p.id desc
      ) as rn
    from public.predictions p
  ),
  doomed as (
    select r.id from ranked r
    where r.rn > 1
      and r.created_at < v_cutoff
      and not exists (select 1 from public.bet_proposal_legs l where l.prediction_id = r.id)
      and not exists (select 1 from public.user_bet_slip_selections s where s.prediction_id = r.id)
    limit p_limit
  )
  delete from public.predictions p using doomed d where p.id = d.id;
  get diagnostics v_predictions = row_count;

  with ranked as (
    select m.id, m.created_at,
      row_number() over (
        partition by m.match_id, m.model_version_id order by m.as_of desc, m.id desc
      ) as rn
    from public.prediction_score_matrices m
  ),
  doomed as (
    select r.id from ranked r where r.rn > 1 and r.created_at < v_cutoff limit p_limit
  )
  delete from public.prediction_score_matrices m using doomed d where m.id = d.id;
  get diagnostics v_matrices = row_count;

  perform set_config('predictra.pruning', 'off', true);
  return jsonb_build_object('predictions', v_predictions, 'score_matrices', v_matrices);
end;
$$;

revoke execute on function public.prune_predictions(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_predictions(integer, integer) to service_role;
