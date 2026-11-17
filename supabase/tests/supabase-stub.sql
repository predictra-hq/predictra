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
