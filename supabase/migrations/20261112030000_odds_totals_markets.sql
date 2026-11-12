-- =============================================================================
-- M3 corsia 0 — quote under/over (ADR 0029)
-- =============================================================================
-- Con il piano gratuito di The Odds API la raccolta giornaliera chiede anche il
-- mercato "totals" quando i crediti bastano fino a fine mese (regola nel collector).
-- Ogni linea è una voce del catalogo, così odds_snapshots non cambia: la linea è nel
-- codice del mercato (totals_2_5 = Under/Over 2,5). Solo linee .5: nessun rimborso.
--
-- app_private.odds_market_for collega le previsioni del motore (TOTAL_GOALS + linea)
-- alle quote corrispondenti, per Bet Builder e schedine.
-- =============================================================================

insert into public.markets (code, name, selections, evaluable) values
  ('totals_0_5', 'Under/Over 0,5', array['OVER', 'UNDER'], true),
  ('totals_1_5', 'Under/Over 1,5', array['OVER', 'UNDER'], true),
  ('totals_2_5', 'Under/Over 2,5', array['OVER', 'UNDER'], true),
  ('totals_3_5', 'Under/Over 3,5', array['OVER', 'UNDER'], true),
  ('totals_4_5', 'Under/Over 4,5', array['OVER', 'UNDER'], true),
  ('totals_5_5', 'Under/Over 5,5', array['OVER', 'UNDER'], true)
on conflict (code) do nothing;

create or replace function app_private.odds_market_for(p_market text, p_line numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_market = '1X2' and p_line is null then 'h2h'
    when p_market = 'TOTAL_GOALS' and p_line in (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
      then 'totals_' || floor(p_line)::int || '_5'
  end;
$$;
