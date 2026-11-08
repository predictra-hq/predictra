-- =============================================================================
-- PREDICTRA — M6 corsia 0: bankroll, movimenti, giocate e limiti personali
-- =============================================================================
-- Decisioni: docs/decisions/0030-bankroll-dati-e-privacy.md, 0031-staking.md
-- Dizionario: docs/data-dictionary/bankroll.md
--
-- Principi:
--  * dati personali e finanziari: RLS SOLO PROPRIETARIO, nessuna policy per gli
--    amministratori (nemmeno Super Admin);
--  * PREDICTRA non movimenta denaro né piazza scommesse: è un registro manuale;
--  * giocate reali e simulate distinte dal tipo del bankroll;
--  * limiti personali applicati nel database all'inserimento di una giocata.
-- =============================================================================

create type public.bankroll_kind as enum ('REAL', 'SIMULATED');
create type public.bankroll_movement_kind as enum ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT');
create type public.bet_status as enum ('OPEN', 'WON', 'LOST', 'VOID', 'HALF_WON', 'HALF_LOST', 'CASHED_OUT');

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------
create table public.bankrolls (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  kind          public.bankroll_kind not null,
  currency      text not null default 'EUR' check (currency = 'EUR'),
  -- Percentuale dello stake flat suggerito (ADR 0031): da 0,1% a 5%.
  flat_stake_pct numeric(5, 4) not null default 0.01 check (flat_stake_pct between 0.001 and 0.05),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bankrolls_name_unique unique (user_id, name)
);
create index bankrolls_user_idx on public.bankrolls (user_id);

create table public.bankroll_movements (
  id           bigint generated always as identity primary key,
  bankroll_id  bigint not null references public.bankrolls (id) on delete cascade,
  kind         public.bankroll_movement_kind not null,
  -- DEPOSIT e WITHDRAWAL: importo positivo; ADJUSTMENT: con segno, diverso da zero.
  amount       numeric(12, 2) not null,
  occurred_at  timestamptz not null default now(),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  constraint bankroll_movements_amount check (
    (kind in ('DEPOSIT', 'WITHDRAWAL') and amount > 0) or (kind = 'ADJUSTMENT' and amount <> 0)
  )
);
create index bankroll_movements_bankroll_idx on public.bankroll_movements (bankroll_id, occurred_at desc);

create table public.bets (
  id                 bigint generated always as identity primary key,
  bankroll_id        bigint not null references public.bankrolls (id) on delete cascade,
  placed_at          timestamptz not null default now(),
  match_id           bigint references public.matches (id) on delete set null,
  description        text check (description is null or char_length(description) <= 200),
  market             text not null check (char_length(market) between 1 and 40),
  selection          text not null check (char_length(selection) between 1 and 40),
  line               numeric(5, 2),
  odds               numeric(8, 3) not null check (odds > 1),
  stake              numeric(12, 2) not null check (stake > 0),
  bookmaker          text check (bookmaker is null or char_length(bookmaker) <= 60),
  status             public.bet_status not null default 'OPEN',
  -- Calcolato dal trigger in base allo stato; inserito dall'utente solo per CASHED_OUT.
  payout             numeric(12, 2) check (payout is null or payout >= 0),
  settled_at         timestamptz,
  closing_odds       numeric(8, 3) check (closing_odds is null or closing_odds > 1),
  bet_proposal_id    bigint references public.bet_proposals (id) on delete set null,
  model_version_id   bigint references public.model_versions (id) on delete set null,
  model_probability  numeric(10, 8) check (model_probability is null or model_probability between 0 and 1),
  note               text check (note is null or char_length(note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bets_subject check (match_id is not null or description is not null),
  constraint bets_settlement check ((status = 'OPEN') = (settled_at is null))
);
create index bets_bankroll_idx on public.bets (bankroll_id, placed_at desc);
create index bets_bankroll_status_idx on public.bets (bankroll_id, status);

-- Limiti personali (ADR 0030 §2): uno per bankroll, tutti facoltativi.
create table public.personal_limits (
  bankroll_id      bigint primary key references public.bankrolls (id) on delete cascade,
  max_stake        numeric(12, 2) check (max_stake is null or max_stake > 0),
  max_open_bets    integer check (max_open_bets is null or max_open_bets > 0),
  max_daily_loss   numeric(12, 2) check (max_daily_loss is null or max_daily_loss > 0),
  max_weekly_loss  numeric(12, 2) check (max_weekly_loss is null or max_weekly_loss > 0),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
create trigger bankrolls_touch before update on public.bankrolls
  for each row execute function app_private.touch_updated_at();
create trigger bets_touch before update on public.bets
  for each row execute function app_private.touch_updated_at();
create trigger personal_limits_touch before update on public.personal_limits
  for each row execute function app_private.touch_updated_at();

-- Il proprietario di un bankroll non cambia.
create function app_private.protect_bankroll_owner()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Il proprietario di un bankroll non cambia' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger bankrolls_owner before update on public.bankrolls
  for each row execute function app_private.protect_bankroll_owner();

-- Una giocata non cambia bankroll (e quindi tipo reale/simulato).
create function app_private.protect_bet_bankroll()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.bankroll_id is distinct from old.bankroll_id then
    raise exception 'Una giocata non si sposta tra bankroll' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger bets_bankroll before update on public.bets
  for each row execute function app_private.protect_bet_bankroll();

-- Incasso dallo stato (ADR 0030 §1).
create function app_private.compute_bet_payout()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.payout := case new.status
    when 'OPEN' then null
    when 'WON' then round(new.stake * new.odds, 2)
    when 'LOST' then 0
    when 'VOID' then new.stake
    when 'HALF_WON' then round(new.stake / 2 * new.odds + new.stake / 2, 2)
    when 'HALF_LOST' then round(new.stake / 2, 2)
    when 'CASHED_OUT' then new.payout
  end;
  if new.status = 'CASHED_OUT' and new.payout is null then
    raise exception 'Per un cash out serve l''importo incassato' using errcode = '22023';
  end if;
  if new.status = 'OPEN' then
    new.settled_at := null;
  elsif new.settled_at is null then
    new.settled_at := now();
  end if;
  return new;
end;
$$;
create trigger bets_payout before insert or update on public.bets
  for each row execute function app_private.compute_bet_payout();

-- Limiti personali, controllati quando si registra una giocata aperta.
create function app_private.check_personal_limits()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_limits public.personal_limits;
  v_open integer;
  v_loss numeric;
begin
  if new.status <> 'OPEN' then
    return new;
  end if;
  select * into v_limits from public.personal_limits where bankroll_id = new.bankroll_id;
  if not found then
    return new;
  end if;
  if v_limits.max_stake is not null and new.stake > v_limits.max_stake then
    raise exception 'Limite personale superato: stake massimo % €', v_limits.max_stake
      using errcode = '23514';
  end if;
  if v_limits.max_open_bets is not null then
    select count(*) into v_open from public.bets
    where bankroll_id = new.bankroll_id and status = 'OPEN';
    if v_open >= v_limits.max_open_bets then
      raise exception 'Limite personale superato: massimo % giocate aperte', v_limits.max_open_bets
        using errcode = '23514';
    end if;
  end if;
  if v_limits.max_daily_loss is not null then
    select coalesce(sum(stake - payout), 0) into v_loss from public.bets
    where bankroll_id = new.bankroll_id and status <> 'OPEN' and settled_at >= now() - interval '24 hours';
    if v_loss >= v_limits.max_daily_loss then
      raise exception 'Limite personale superato: perdita massima giornaliera % €', v_limits.max_daily_loss
        using errcode = '23514';
    end if;
  end if;
  if v_limits.max_weekly_loss is not null then
    select coalesce(sum(stake - payout), 0) into v_loss from public.bets
    where bankroll_id = new.bankroll_id and status <> 'OPEN' and settled_at >= now() - interval '7 days';
    if v_loss >= v_limits.max_weekly_loss then
      raise exception 'Limite personale superato: perdita massima settimanale % €', v_limits.max_weekly_loss
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger bets_limits before insert on public.bets
  for each row execute function app_private.check_personal_limits();

-- -----------------------------------------------------------------------------
-- Viste
-- -----------------------------------------------------------------------------

-- Giocate con profitto calcolato e tipo del bankroll.
create view public.v_bets
with (security_invoker = true) as
select
  b.*,
  br.kind as bankroll_kind,
  br.name as bankroll_name,
  case when b.status = 'OPEN' then null else b.payout - b.stake end as profit
from public.bets b
join public.bankrolls br on br.id = b.bankroll_id;

-- Saldo e riepilogo per bankroll.
create view public.v_bankroll_summary
with (security_invoker = true) as
select
  br.id as bankroll_id,
  br.name,
  br.kind,
  br.currency,
  br.flat_stake_pct,
  br.created_at,
  coalesce(mv.deposits, 0) as deposits,
  coalesce(mv.withdrawals, 0) as withdrawals,
  coalesce(mv.adjustments, 0) as adjustments,
  coalesce(bt.settled_profit, 0) as settled_profit,
  coalesce(bt.open_stakes, 0) as open_stakes,
  coalesce(mv.deposits, 0) - coalesce(mv.withdrawals, 0) + coalesce(mv.adjustments, 0)
    + coalesce(bt.settled_profit, 0) as balance,
  coalesce(mv.deposits, 0) - coalesce(mv.withdrawals, 0) + coalesce(mv.adjustments, 0)
    + coalesce(bt.settled_profit, 0) - coalesce(bt.open_stakes, 0) as available,
  coalesce(bt.open_bets, 0) as open_bets,
  coalesce(bt.settled_bets, 0) as settled_bets,
  coalesce(bt.settled_stakes, 0) as settled_stakes
from public.bankrolls br
left join lateral (
  select
    sum(amount) filter (where kind = 'DEPOSIT') as deposits,
    sum(amount) filter (where kind = 'WITHDRAWAL') as withdrawals,
    sum(amount) filter (where kind = 'ADJUSTMENT') as adjustments
  from public.bankroll_movements m where m.bankroll_id = br.id
) mv on true
left join lateral (
  select
    sum(payout - stake) filter (where status <> 'OPEN') as settled_profit,
    sum(stake) filter (where status = 'OPEN') as open_stakes,
    (count(*) filter (where status = 'OPEN'))::integer as open_bets,
    (count(*) filter (where status <> 'OPEN'))::integer as settled_bets,
    sum(stake) filter (where status <> 'OPEN') as settled_stakes
  from public.bets b where b.bankroll_id = br.id
) bt on true;

-- -----------------------------------------------------------------------------
-- RLS: SOLO PROPRIETARIO. Nessuna policy per amministratori.
-- -----------------------------------------------------------------------------
create function app_private.owns_bankroll(p_bankroll_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app_private.is_active_user() and exists (
    select 1 from public.bankrolls where id = p_bankroll_id and user_id = auth.uid()
  );
$$;

alter table public.bankrolls          enable row level security;
alter table public.bankroll_movements enable row level security;
alter table public.bets               enable row level security;
alter table public.personal_limits    enable row level security;

revoke all on
  public.bankrolls, public.bankroll_movements, public.bets, public.personal_limits,
  public.v_bets, public.v_bankroll_summary
from public, anon, authenticated;

grant select, insert, update, delete on
  public.bankrolls, public.bankroll_movements, public.bets, public.personal_limits
to authenticated;
grant select on public.v_bets, public.v_bankroll_summary to authenticated;

create policy bankrolls_owner on public.bankrolls for all to authenticated
  using (user_id = auth.uid() and app_private.is_active_user())
  with check (user_id = auth.uid() and app_private.is_active_user());
create policy bankroll_movements_owner on public.bankroll_movements for all to authenticated
  using (app_private.owns_bankroll(bankroll_id))
  with check (app_private.owns_bankroll(bankroll_id));
create policy bets_owner on public.bets for all to authenticated
  using (app_private.owns_bankroll(bankroll_id))
  with check (app_private.owns_bankroll(bankroll_id));
create policy personal_limits_owner on public.personal_limits for all to authenticated
  using (app_private.owns_bankroll(bankroll_id))
  with check (app_private.owns_bankroll(bankroll_id));

revoke execute on function app_private.owns_bankroll(bigint) from public, anon;
grant execute on function app_private.owns_bankroll(bigint) to authenticated;
revoke execute on function app_private.protect_bankroll_owner() from public, anon, authenticated;
revoke execute on function app_private.protect_bet_bankroll() from public, anon, authenticated;
revoke execute on function app_private.compute_bet_payout() from public, anon, authenticated;
revoke execute on function app_private.check_personal_limits() from public, anon, authenticated;
