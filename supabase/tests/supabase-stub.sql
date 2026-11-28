-- Emulazione minima dell'ambiente Supabase su cui si applicano le migrazioni reali:
-- schema `auth`, ruoli `anon`/`authenticated`/`service_role`, claim JWT, privilegi
-- predefiniti. La usano i test (harness.ts, PGlite) e la prova della copia tra
-- ambienti (scripts/sync/local-db.sh, Postgres nel runner).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- Come in Supabase: i claim arrivano da request.jwt.claims (GUC).
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

-- Privilegi predefiniti di Supabase sullo schema public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Realtime di Supabase (ADR 0081): i messaggi Broadcast stanno in realtime.messages, che
-- `realtime.send` riempie e le policy proteggono con `realtime.topic()`. Qui la stessa
-- forma, così i test vedono gli avvisi inviati dai trigger.
create schema realtime;
grant usage on schema realtime to authenticated, service_role;
create table realtime.messages (
  id          bigint generated always as identity primary key,
  topic       text not null,
  extension   text not null default 'broadcast',
  event       text,
  payload     jsonb,
  private     boolean default true,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.messages (topic, event, payload, private) values ($3, $2, $1, $4)
$$;
