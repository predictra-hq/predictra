-- Cancellare un utente anonimizza le sue voci di audit (FK `on delete set null`), ma il
-- trigger append-only bloccava anche questo aggiornamento: nessun utente con attività
-- registrate si poteva cancellare, nemmeno dalla dashboard di Supabase.
-- L'audit resta append-only: l'unica modifica ammessa è togliere l'autore (actor_id → null)
-- lasciando tutto il resto identico. Cancellazioni e altre modifiche restano vietate.

create or replace function app_private.forbid_audit_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null
     and new.actor_id is null
     and new.id = old.id
     and new.occurred_at is not distinct from old.occurred_at
     and new.action is not distinct from old.action
     and new.target_type is not distinct from old.target_type
     and new.target_id is not distinct from old.target_id
     and new.metadata is not distinct from old.metadata then
    return new;
  end if;
  raise exception 'audit_logs è append-only' using errcode = '42501';
end;
$$;
