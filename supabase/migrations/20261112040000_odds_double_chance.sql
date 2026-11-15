-- =============================================================================
-- M3 corsia 0 — doppia chance per partita (ADR 0032)
-- =============================================================================
-- Verificato su DEV il 12/11/2026 con una richiesta reale (/events/{id}/odds, Serie A
-- Como–Cagliari): la doppia chance la offrono Pinnacle, 1xBet, Marathon, William Hill e
-- Codere (IT). Gol/no gol e draw no bet solo bookmaker esteri: non raccolti.
-- La raccolta giornaliera la chiede, partita per partita, con i crediti avanzati dal
-- piano del giorno (collector, ADR 0032).
-- =============================================================================

insert into public.markets (code, name, selections, evaluable) values
  ('double_chance', 'Doppia chance', array['HOME_DRAW', 'HOME_AWAY', 'DRAW_AWAY'], true)
on conflict (code) do nothing;

create or replace function app_private.odds_market_for(p_market text, p_line numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_market = '1X2' and p_line is null then 'h2h'
    when p_market = 'DOUBLE_CHANCE' and p_line is null then 'double_chance'
    when p_market = 'TOTAL_GOALS' and p_line in (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
      then 'totals_' || floor(p_line)::int || '_5'
  end;
$$;
