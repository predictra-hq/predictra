-- =============================================================================
-- M3 — ultime quote per un elenco di partite, veloce
-- =============================================================================
-- `v_latest_odds` calcola l'ultima quota con DISTINCT ON su tutto `odds_snapshots`:
-- filtrata per `match_id` (colonna di `odds_events`) non usa l'indice e scorre tutto lo
-- storico. Con la crescita delle quote le pagine andavano in "statement timeout".
-- Questa funzione parte dagli eventi delle partite richieste (indice
-- `odds_events_match_idx`) e per ogni evento legge le ultime quote con l'indice
-- `odds_snapshots_latest_idx`. Stesse righe e stesso ordine di `v_latest_odds`.
-- SECURITY INVOKER: valgono la RLS e i permessi di chi chiama (sola lettura).
-- =============================================================================

create function public.latest_odds_for_matches(p_match_ids bigint[])
returns table (
  match_id     bigint,
  bookmaker    text,
  market       text,
  selection    text,
  price        numeric,
  event_time   timestamptz,
  observed_at  timestamptz,
  quality      public.quality_status
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.event_id, s.bookmaker, s.market, s.selection)
    e.match_id, s.bookmaker, s.market, s.selection, s.price, s.event_time, s.observed_at,
    s.quality
  from public.odds_events e
  join public.odds_snapshots s on s.event_id = e.id
  where e.match_id = any (p_match_ids)
  order by s.event_id, s.bookmaker, s.market, s.selection, s.event_time desc, s.observed_at desc;
$$;

revoke execute on function public.latest_odds_for_matches(bigint[]) from public, anon;
grant execute on function public.latest_odds_for_matches(bigint[]) to authenticated, service_role;
