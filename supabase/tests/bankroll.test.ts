/**
 * Test del contratto M6: isolamento dei dati personali, calcolo degli incassi,
 * limiti personali. Importi e giocate fittizi (DEMO).
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BANKROLL_KINDS, BET_STATUSES, MOVEMENT_KINDS } from "@predictra/shared-types";
import {
  asAnon,
  asUser,
  attempt,
  createAuthUser,
  createDatabase,
  grantRole,
  type TestUser,
} from "./harness";

type Tx = Pick<PGlite, "query" | "exec">;

let db: PGlite;
let alice: TestUser;
let bob: TestUser;
let superAdmin: TestUser;
let admin: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;
const num = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number((await one<{ v: number | string }>(tx, sql, params)).v);

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, bob.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
  await grantRole(db, admin.id, "ADMIN");
});

async function createBankroll(tx: Tx, name = "DEMO reale", kind = "REAL"): Promise<number> {
  return num(
    tx,
    "insert into public.bankrolls (name, kind) values ($1, $2::public.bankroll_kind) returning id v",
    [name, kind],
  );
}

async function addBet(tx: Tx, bankroll: number, stake = 10, odds = 2, status = "OPEN") {
  return num(
    tx,
    `insert into public.bets (bankroll_id, description, market, selection, odds, stake, status)
     values ($1, 'DEMO partita', '1X2', 'HOME', $2, $3, $4::public.bet_status) returning id v`,
    [bankroll, odds, stake, status],
  );
}

describe("contratto bankroll", () => {
  it("enum coerenti con i tipi condivisi", async () => {
    const values = async (t: string) =>
      (
        await db.query<{ v: string }>(
          `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = $1 order by e.enumsortorder`,
          [t],
        )
      ).rows.map((r) => r.v);
    expect(await values("bankroll_kind")).toEqual([...BANKROLL_KINDS]);
    expect(await values("bankroll_movement_kind")).toEqual([...MOVEMENT_KINDS]);
    expect(await values("bet_status")).toEqual([...BET_STATUSES]);
  });

  it("nessuna policy per gli amministratori sulle tabelle del bankroll", async () => {
    const { rows } = await db.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check from pg_policies
       where tablename in ('bankrolls', 'bankroll_movements', 'bets', 'personal_limits')`,
    );
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(`${r.qual} ${r.with_check}`).not.toMatch(/is_admin|has_role/);
    }
  });
});

describe("isolamento", () => {
  it("ogni utente vede e modifica solo i propri dati", async () => {
    const aliceBankroll = await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      await tx.query(
        "insert into public.bankroll_movements (bankroll_id, kind, amount) values ($1, 'DEPOSIT', 100)",
        [id],
      );
      await addBet(tx, id);
      await tx.query(
        "insert into public.personal_limits (bankroll_id, max_stake) values ($1, 50)",
        [id],
      );
      return id;
    });

    await asUser(db, bob, async (tx) => {
      for (const t of [
        "bankrolls",
        "bankroll_movements",
        "bets",
        "personal_limits",
        "v_bets",
        "v_bankroll_summary",
      ]) {
        expect(await num(tx, `select count(*)::int v from public.${t}`), t).toBe(0);
      }
      // Scrivere nel bankroll di un altro: rifiutato.
      expect(
        await attempt(
          tx,
          "insert into public.bets (bankroll_id, description, market, selection, odds, stake) values ($1, 'x', '1X2', 'HOME', 2, 1)",
          [aliceBankroll],
        ),
      ).toMatch(/row-level security/);
      expect(
        await attempt(
          tx,
          "insert into public.bankroll_movements (bankroll_id, kind, amount) values ($1, 'DEPOSIT', 1)",
          [aliceBankroll],
        ),
      ).toMatch(/row-level security/);
      // Modificare o cancellare: nessuna riga toccata.
      await tx.query("update public.bets set stake = 999 where bankroll_id = $1", [aliceBankroll]);
      await tx.query("delete from public.bankrolls where id = $1", [aliceBankroll]);
      // Creare un bankroll a nome di un altro: rifiutato.
      expect(
        await attempt(
          tx,
          "insert into public.bankrolls (user_id, name, kind) values ($1, 'x', 'REAL')",
          [alice.id],
        ),
      ).toMatch(/row-level security/);
    });

    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select stake v from public.bets")).toBe(10);
      expect(await num(tx, "select count(*)::int v from public.bankrolls")).toBe(1);
    });
  });

  it("nemmeno un Super Admin o un Admin legge i dati di qualcuno", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      await addBet(tx, id);
    });
    for (const user of [superAdmin, admin]) {
      await asUser(db, user, async (tx) => {
        for (const t of ["bankrolls", "bets", "v_bankroll_summary"]) {
          expect(await num(tx, `select count(*)::int v from public.${t}`), t).toBe(0);
        }
      });
    }
  });

  it("anon non accede; un utente sospeso non vede più i propri dati", async () => {
    await asUser(db, alice, (tx) => createBankroll(tx));
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.bankrolls")).toMatch(/permission denied/);
    });
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [alice.id],
    );
    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select count(*)::int v from public.bankrolls")).toBe(0);
    });
  });

  it("il proprietario non si cambia e una giocata non cambia bankroll", async () => {
    await asUser(db, alice, async (tx) => {
      const a = await createBankroll(tx, "DEMO reale", "REAL");
      const b = await createBankroll(tx, "DEMO simulato", "SIMULATED");
      const bet = await addBet(tx, a);
      expect(
        await attempt(tx, "update public.bets set bankroll_id = $1 where id = $2", [b, bet]),
      ).toMatch(/non si sposta/);
      expect(
        await attempt(tx, "update public.bankrolls set user_id = $1 where id = $2", [bob.id, a]),
      ).not.toBeNull();
    });
  });

  it("cancellare un bankroll cancella le sue giocate e i movimenti", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      await addBet(tx, id);
      await tx.query("delete from public.bankrolls where id = $1", [id]);
      expect(await num(tx, "select count(*)::int v from public.bets")).toBe(0);
    });
  });
});

describe("incassi e saldo", () => {
  it("incasso calcolato dallo stato", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      const cases: [string, number][] = [
        ["WON", 21],
        ["LOST", 0],
        ["VOID", 10],
        ["HALF_WON", 15.5],
        ["HALF_LOST", 5],
      ];
      for (const [status, expected] of cases) {
        const bet = await addBet(tx, id, 10, 2.1, status);
        expect(await num(tx, "select payout v from public.bets where id = $1", [bet]), status).toBe(
          expected,
        );
      }
      const open = await addBet(tx, id, 10, 2.1);
      expect(
        await one(tx, "select payout, settled_at from public.bets where id = $1", [open]),
      ).toEqual({
        payout: null,
        settled_at: null,
      });
      expect(
        await attempt(tx, "update public.bets set status = 'CASHED_OUT' where id = $1", [open]),
      ).toMatch(/cash out/);
      await tx.query("update public.bets set status = 'CASHED_OUT', payout = 14 where id = $1", [
        open,
      ]);
      expect(await num(tx, "select profit v from public.v_bets where id = $1", [open])).toBe(4);
    });
  });

  it("saldo e disponibile per bankroll, reali e simulati separati", async () => {
    await asUser(db, alice, async (tx) => {
      const real = await createBankroll(tx, "DEMO reale", "REAL");
      const sim = await createBankroll(tx, "DEMO simulato", "SIMULATED");
      await tx.query(
        `insert into public.bankroll_movements (bankroll_id, kind, amount) values
         ($1, 'DEPOSIT', 200), ($1, 'WITHDRAWAL', 50), ($1, 'ADJUSTMENT', -5), ($2, 'DEPOSIT', 1000)`,
        [real, sim],
      );
      await addBet(tx, real, 10, 2, "WON"); // +10
      await addBet(tx, real, 20, 3, "LOST"); // −20
      await addBet(tx, real, 15, 2); // aperta
      await addBet(tx, sim, 100, 2, "WON"); // +100 solo nel simulato
      const s = await one<Record<string, string>>(
        tx,
        "select balance::text, available::text, open_bets, settled_bets from public.v_bankroll_summary where bankroll_id = $1",
        [real],
      );
      expect(s).toEqual({ balance: "135.00", available: "120.00", open_bets: 1, settled_bets: 2 });
      expect(
        await num(tx, "select balance v from public.v_bankroll_summary where bankroll_id = $1", [
          sim,
        ]),
      ).toBe(1100);
    });
  });

  it("importi dei movimenti coerenti con il tipo", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      const ins =
        "insert into public.bankroll_movements (bankroll_id, kind, amount) values ($1, $2::public.bankroll_movement_kind, $3)";
      expect(await attempt(tx, ins, [id, "DEPOSIT", -10])).toMatch(/bankroll_movements_amount/);
      expect(await attempt(tx, ins, [id, "ADJUSTMENT", 0])).toMatch(/bankroll_movements_amount/);
      expect(await attempt(tx, ins, [id, "ADJUSTMENT", -3])).toBeNull();
    });
  });
});

describe("limiti personali", () => {
  it("stake massimo e giocate aperte", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      await tx.query(
        "insert into public.personal_limits (bankroll_id, max_stake, max_open_bets) values ($1, 20, 2)",
        [id],
      );
      await addBet(tx, id, 20);
      await addBet(tx, id, 5);
      const err = await attempt(
        tx,
        "insert into public.bets (bankroll_id, description, market, selection, odds, stake) values ($1, 'x', '1X2', 'HOME', 2, 5)",
        [id],
      );
      expect(err).toMatch(/massimo 2 giocate aperte/);
      const tooBig = await attempt(
        tx,
        "insert into public.bets (bankroll_id, description, market, selection, odds, stake) values ($1, 'x', '1X2', 'HOME', 2, 25)",
        [id],
      );
      expect(tooBig).toMatch(/stake massimo/);
    });
  });

  it("perdita massima giornaliera", async () => {
    await asUser(db, alice, async (tx) => {
      const id = await createBankroll(tx);
      await tx.query(
        "insert into public.personal_limits (bankroll_id, max_daily_loss) values ($1, 30)",
        [id],
      );
      await addBet(tx, id, 20, 2, "LOST");
      await addBet(tx, id, 5); // perdita 20 < 30: consentita
      await addBet(tx, id, 10, 2, "LOST"); // ora 30
      const err = await attempt(
        tx,
        "insert into public.bets (bankroll_id, description, market, selection, odds, stake) values ($1, 'x', '1X2', 'HOME', 2, 1)",
        [id],
      );
      expect(err).toMatch(/perdita massima giornaliera/);
    });
  });
});
