-- Schedine consigliate riproducibili (regola 4 del Prompt Master, ADR 0020, 0075).
--
-- 1. Con ogni schedina si salvano la versione del modello, la versione e il contenuto delle
--    regole (profilo, peso del mercato, soglie, età massima delle quote) e quante volte le
--    soglie sono state allargate. Le colonne restano vuote per le schedine già salvate.
-- 2. Una schedina è la proposta di quel momento: un giro successivo dell'agente con la
--    stessa schedina aggiorna solo `last_seen_at`. Prima l'upsert sovrascriveva quota e
--    probabilità con l'ultimo giro, cioè con quote quasi di chiusura, e la verifica dei
--    risultati non usava più la quota proposta davvero.
alter table public.recommended_slips
  add column model_version_id bigint,
  add column rules_version    text check (rules_version is null or char_length(rules_version) between 1 and 40),
  add column rules            jsonb check (rules is null or (jsonb_typeof(rules) = 'object' and pg_column_size(rules) <= 4096)),
  add column relax_step       smallint check (relax_step is null or relax_step between 0 and 10);

comment on column public.recommended_slips.model_version_id is
  'Versione del modello delle previsioni usate (model_versions.id); null se miste o non note.';
comment on column public.recommended_slips.rules is
  'Regole con cui è stata costruita la schedina (slipRulesSnapshot in apps/web/src/lib/bet-builder/bollette.ts).';

create function app_private.recommended_slips_keep_proposal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.picks := old.picks;
  new.price := old.price;
  new.probability := old.probability;
  new.expected_value := old.expected_value;
  new.odds_observed_at := old.odds_observed_at;
  new.first_kickoff_at := old.first_kickoff_at;
  new.source := old.source;
  new.first_seen_at := old.first_seen_at;
  new.model_version_id := coalesce(old.model_version_id, new.model_version_id);
  new.rules_version := coalesce(old.rules_version, new.rules_version);
  new.rules := coalesce(old.rules, new.rules);
  new.relax_step := coalesce(old.relax_step, new.relax_step);
  new.last_seen_at := greatest(old.last_seen_at, new.last_seen_at);
  return new;
end;
$$;

revoke all on function app_private.recommended_slips_keep_proposal() from public, anon, authenticated;

create trigger recommended_slips_keep_proposal
  before update on public.recommended_slips
  for each row execute function app_private.recommended_slips_keep_proposal();
