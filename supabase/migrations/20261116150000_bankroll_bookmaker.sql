-- Bankroll collegato a un sito di scommesse (richiesta del proprietario, 16/11/2026).
--
-- Ogni bankroll può indicare il bookmaker su cui si gioca:
-- - `bookmaker_code`: uno dei bookmaker di cui PREDICTRA raccoglie le quote. Le schedine
--   e le Certezze mostrano la quota di quel sito quando c'è, e "L'ho giocata" la propone.
-- - `bookmaker_name`: il nome del sito come lo scrive l'utente (es. un sito di cui non
--   raccogliamo le quote). In quel caso si parte dalla migliore quota disponibile e
--   l'utente la corregge quando registra la giocata.
-- Nessun dato nuovo da fonti esterne. RLS invariata: il bankroll resta del solo proprietario.

alter table public.bankrolls
  add column bookmaker_code text references public.bookmakers (code) on delete set null,
  add column bookmaker_name text
    check (bookmaker_name is null or char_length(btrim(bookmaker_name)) between 1 and 60);

-- Le due colonne nuove in fondo al riepilogo (le colonne esistenti non cambiano).
create or replace view public.v_bankroll_summary
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
  coalesce(bt.settled_stakes, 0) as settled_stakes,
  br.bookmaker_code,
  br.bookmaker_name
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
