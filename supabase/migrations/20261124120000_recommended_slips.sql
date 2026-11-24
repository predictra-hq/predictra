-- Schedine consigliate salvate (ADR 0070). Prima si calcolavano solo al momento, quindi
-- dopo le partite non si ritrovavano più quelle proposte davvero. Le scrive l'avvio
-- programmato dell'agente (chiave di servizio) a ogni giro; le leggono tutti gli utenti
-- attivi. Nessun dato personale: sono uguali per tutti, si copiano da PROD a DEV.
create table public.recommended_slips (
  id                bigint generated always as identity primary key,
  window_kind       text not null check (window_kind in ('round', 'day')),
  window_start      date not null,
  profile           text not null check (profile in ('DOUBLE', 'SOLID', 'BALANCED', 'HIGH')),
  -- Partite ed esiti, in ordine: distingue due schedine diverse dello stesso profilo.
  signature         text not null check (char_length(signature) between 1 and 2000),
  -- Giocate come le mostra la pagina: partita, squadre, esito, quota, probabilità.
  picks             jsonb not null check (jsonb_typeof(picks) = 'array' and jsonb_array_length(picks) between 1 and 10),
  price             numeric(16, 6) not null check (price > 1),
  probability       numeric(10, 8) not null check (probability > 0 and probability <= 1),
  expected_value    numeric(12, 6) not null,
  odds_observed_at  timestamptz,
  first_kickoff_at  timestamptz not null,
  -- live: proposta prima delle partite; rebuilt: ricostruita dopo con i dati di allora.
  source            text not null default 'live' check (source in ('live', 'rebuilt')),
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  constraint recommended_slips_unique unique (window_kind, window_start, profile, signature)
);

create index recommended_slips_window on public.recommended_slips (window_kind, window_start desc);

alter table public.recommended_slips enable row level security;

create policy recommended_slips_read on public.recommended_slips
  for select to authenticated
  using ((select app_private.is_active_user()));

revoke all on public.recommended_slips from public, anon, authenticated;
grant select on public.recommended_slips to authenticated;
grant all on public.recommended_slips to service_role;
