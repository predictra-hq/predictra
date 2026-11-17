-- =============================================================================
-- M4 — ultime previsioni fatte prima del calcio d'inizio, di qualunque versione
-- =============================================================================
-- `v_active_predictions` mostra solo la versione oggi attiva: dopo un cambio di versione
-- le partite già giocate restano senza previsione e le verifiche sul passato (pagina
-- Certezze, comando `market` del motore) si svuotano. Questa vista prende, per partita,
-- mercato, linea e selezione, l'ultima previsione della stessa famiglia del modello
-- attivo (stesso `model_key`), di qualunque versione. Il trigger anti-leakage garantisce
-- già che `as_of` non superi il calcio d'inizio. Sola lettura, RLS delle tabelle.
-- =============================================================================

create view public.v_pre_kickoff_predictions
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
join public.model_versions mv on mv.id = p.model_version_id
join public.matches m on m.id = p.match_id
join public.teams hm on hm.id = m.home_team_id
join public.teams aw on aw.id = m.away_team_id
where mv.model_key = (select a.model_key from public.model_versions a where a.status = 'ACTIVE')
  and p.as_of <= m.kickoff_at
order by p.match_id, p.market, p.line, p.selection, p.as_of desc, p.id desc;

revoke all on public.v_pre_kickoff_predictions from public, anon, authenticated;
grant select on public.v_pre_kickoff_predictions to authenticated, service_role;
