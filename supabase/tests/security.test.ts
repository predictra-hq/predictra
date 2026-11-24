/**
 * Revisione di sicurezza (M8, A3): invarianti del catalogo, verificate con tutte le
 * migrazioni applicate. Un allargamento dei permessi deve essere voluto: in quel caso
 * si aggiorna l'elenco qui sotto nella stessa PR, spiegando il motivo.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase();
});

const names = async (sql: string) =>
  (await db.query<{ name: string }>(sql)).rows.map((r) => r.name).sort();

/** Funzioni che un utente autenticato può eseguire. Le RPC ricontrollano ruolo, stato e 2FA. */
const AUTHENTICATED_FUNCTIONS = [
  // helper usati dalle policy RLS (schema non esposto da PostgREST)
  "app_private.can_monitor_agents",
  "app_private.current_roles",
  "app_private.has_role",
  "app_private.is_active_user",
  "app_private.is_adult_user",
  "app_private.is_admin",
  "app_private.odds_market_for",
  "app_private.owns_bankroll",
  // RPC dell'app
  "public.accept_invitation",
  "public.add_team_alias",
  "public.admin_update_profile",
  "public.ask_consume",
  "public.ask_record",
  // SECURITY DEFINER di sola lettura: nome visualizzato e stile, mai email o date
  "public.birthdays_today",
  "public.authorize_password_reset",
  "public.community_feed",
  "public.create_invitation",
  // sola lettura, SECURITY INVOKER: rispetta la RLS di chi chiama (quote per partita)
  "public.latest_odds_for_matches",
  "public.match_comment_feed",
  "public.moderate_community_post",
  "public.moderate_match_comment",
  "public.recent_comment_feed",
  "public.retry_dead_agent_job",
  "public.revoke_invitation",
  "public.set_account_status",
  "public.set_active_model_version",
  "public.set_user_role",
  "public.training_results",
].sort();

/** Tabelle in cui un utente autenticato può scrivere: solo dati propri, con policy proprietario. */
const AUTHENTICATED_WRITABLE = [
  "bankroll_movements",
  "bankrolls",
  "bets",
  "community_posts",
  "community_reactions",
  "match_comments",
  "personal_limits",
  "user_bet_slip_selections",
  "user_bet_slips",
  "user_birthdays",
  "user_dashboard_settings",
  "user_follows",
  "user_preferences",
].sort();

describe("revisione di sicurezza del database", () => {
  it("RLS attiva su tutte le tabelle di public e app_private", async () => {
    expect(
      await names(`select n.nspname || '.' || c.relname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'app_private') and c.relkind = 'r' and not c.relrowsecurity`),
    ).toEqual([]);
  });

  it("le policy di lettura controllano l'utente attivo una volta per istruzione, non per riga", async () => {
    // `using (app_private.is_active_user())` viene valutata a ogni riga: con le quote
    // portava le pagine in timeout. Va scritta `using ((select app_private.is_active_user()))`.
    const { rows } = await db.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and qual = 'app_private.is_active_user()'`,
    );
    expect(rows.map((r) => r.policyname)).toEqual([]);
  });

  it("tutte le viste di public applicano la RLS di chi le interroga (security_invoker)", async () => {
    expect(
      await names(`select c.relname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'
          and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)`),
    ).toEqual([]);
  });

  it("ogni funzione SECURITY DEFINER fissa il search_path", async () => {
    expect(
      await names(`select n.nspname || '.' || p.proname as name from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private') and p.prosecdef
          and not coalesce(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'), false)`),
    ).toEqual([]);
  });

  it("anon non legge nessuna relazione e non esegue nessuna funzione", async () => {
    expect(
      await names(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
          and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
               or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))`),
    ).toEqual([]);
    expect(
      await names(`select n.nspname || '.' || p.proname as name from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private') and has_function_privilege('anon', p.oid, 'EXECUTE')`),
    ).toEqual([]);
  });

  it("le funzioni eseguibili da un utente sono solo quelle previste", async () => {
    expect(
      await names(`select distinct n.nspname || '.' || p.proname as name from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private') and has_function_privilege('authenticated', p.oid, 'EXECUTE')`),
    ).toEqual(AUTHENTICATED_FUNCTIONS);
  });

  it("un utente scrive solo nelle tabelle dei propri dati, tutte con policy proprietario", async () => {
    const writable = await names(`select c.relname as name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (has_table_privilege('authenticated', c.oid, 'INSERT')
             or has_table_privilege('authenticated', c.oid, 'UPDATE')
             or has_table_privilege('authenticated', c.oid, 'DELETE'))`);
    expect(writable).toEqual(AUTHENTICATED_WRITABLE);

    const { rows } = await db.query<{ tablename: string; qual: string; with_check: string }>(
      `select tablename, coalesce(qual, '') qual, coalesce(with_check, '') with_check from pg_policies
       where schemaname = 'public' and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
         and tablename = any($1)`,
      [AUTHENTICATED_WRITABLE],
    );
    for (const table of AUTHENTICATED_WRITABLE) {
      const policies = rows.filter((r) => r.tablename === table);
      expect(policies.length, table).toBeGreaterThan(0);
      for (const p of policies) {
        // La condizione lega la riga all'utente corrente (direttamente o tramite il bankroll).
        expect(`${p.qual} ${p.with_check}`, table).toMatch(/auth\.uid\(\)|owns_bankroll/);
        expect(`${p.qual} ${p.with_check}`, table).not.toMatch(/is_admin|has_role/);
      }
    }
  });

  it("aggiornamenti per colonna fuori dalle tabelle proprie: nome, stile del nome e read_at", async () => {
    const { rows } = await db.query<{ t: string; c: string }>(
      `select table_name t, column_name c from information_schema.column_privileges
       where grantee = 'authenticated' and privilege_type = 'UPDATE' and table_schema = 'public'
         and table_name <> all($1)`,
      [AUTHENTICATED_WRITABLE],
    );
    expect(rows.map((r) => `${r.t}.${r.c}`).sort()).toEqual([
      "notifications.read_at",
      "profiles.avatar_style",
      "profiles.display_name",
      "profiles.name_color",
      "profiles.name_style",
    ]);
  });
});
