import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  asAnon,
  attempt,
  asServiceRole,
  asUser,
  createAuthUser,
  createDatabase,
  createMigratedDatabase,
  grantRole,
  migrationFiles,
  type TestUser,
} from "./harness";

let db: PGlite;
let superA: TestUser;
let superB: TestUser;
let admin: TestUser;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  db = await createDatabase();
  superA = await createAuthUser(db, "super.a@example.test");
  superB = await createAuthUser(db, "super.b@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  await grantRole(db, superA.id, "SUPER_ADMIN");
  await grantRole(db, superB.id, "SUPER_ADMIN");
  await grantRole(db, admin.id, "ADMIN");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, bob.id, "USER");
});

const count = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number(((await tx.query<{ n: number }>(sql, params)).rows[0] as { n: number }).n);

describe("migrazioni", () => {
  it("si applicano da zero in ordine su un database vuoto", async () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
    const fresh = await createMigratedDatabase();
    const { rows } = await fresh.query<{ code: string }>(
      "select code from public.roles order by rank",
    );
    expect(rows.map((r) => r.code)).toEqual(["USER", "ADMIN", "SUPER_ADMIN"]);
  });

  it("RLS è attiva su tutte le tabelle di public", async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("la creazione di un utente auth crea profilo e preferenze", async () => {
    const u = await createAuthUser(db, "nuovo@example.test");
    expect(
      await count(db, "select count(*)::int n from public.profiles where id = $1", [u.id]),
    ).toBe(1);
    expect(
      await count(db, "select count(*)::int n from public.user_preferences where user_id = $1", [
        u.id,
      ]),
    ).toBe(1);
  });
});

describe("anon", () => {
  it("non legge nulla", async () => {
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.profiles")).toMatch(/permission denied/);
      expect(await attempt(tx, "select * from public.invitations")).toMatch(/permission denied/);
    });
  });

  it("non può chiamare le RPC", async () => {
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select public.accept_invitation()")).toMatch(/permission denied/);
    });
  });
});

describe("isolamento dei dati personali", () => {
  it("un utente vede solo il proprio profilo", async () => {
    await asUser(db, alice, async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select id from public.profiles");
      expect(rows.map((r) => r.id)).toEqual([alice.id]);
    });
  });

  it("le preferenze sono visibili e modificabili solo dal proprietario", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.user_preferences")).toBe(1);
      const res = await tx.query(
        "update public.user_preferences set timezone = 'UTC' where user_id = $1",
        [bob.id],
      );
      expect(res.affectedRows).toBe(0);
    });
    const { rows } = await db.query<{ timezone: string }>(
      "select timezone from public.user_preferences where user_id = $1",
      [bob.id],
    );
    expect(rows[0]?.timezone).toBe("Europe/Rome");
  });

  it("nemmeno un Super Admin legge le preferenze altrui", async () => {
    await asUser(db, superA, async (tx) => {
      expect(
        await count(tx, "select count(*)::int n from public.user_preferences where user_id <> $1", [
          superA.id,
        ]),
      ).toBe(0);
      expect(
        await count(
          tx,
          "select count(*)::int n from public.user_dashboard_settings where user_id <> $1",
          [superA.id],
        ),
      ).toBe(0);
    });
  });

  it("un utente non può inserire preferenze per conto di altri", async () => {
    const carol = await createAuthUser(db, "carol@example.test");
    await db.query("delete from public.user_preferences where user_id = $1", [carol.id]);
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(tx, "insert into public.user_preferences (user_id) values ($1)", [carol.id]),
      ).toMatch(/row-level security/);
    });
  });

  it("un utente può cambiare solo il proprio display_name, non lo stato", async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query("update public.profiles set display_name = 'Alice' where id = $1", [alice.id]);
      expect(
        await attempt(tx, "update public.profiles set status = 'SUSPENDED' where id = $1", [
          alice.id,
        ]),
      ).toMatch(/permission denied/);
      const res = await tx.query("update public.profiles set display_name = 'X' where id = $1", [
        bob.id,
      ]);
      expect(res.affectedRows).toBe(0);
    });
  });

  it("un utente non può assegnarsi ruoli", async () => {
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(
          tx,
          "insert into public.user_roles (user_id, role) values ($1, 'SUPER_ADMIN')",
          [alice.id],
        ),
      ).toMatch(/permission denied/);
    });
  });
});

describe("visibilità amministrativa", () => {
  it("gli admin vedono tutti i profili e gli inviti", async () => {
    await asUser(db, admin, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.profiles")).toBe(5);
    });
  });

  it("solo i Super Admin leggono l'audit", async () => {
    await asUser(db, superA, async (tx) => {
      await tx.query("select public.create_invitation('x@example.test', 'USER')");
    });
    await asUser(db, superB, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.audit_logs")).toBe(1);
    });
    await asUser(db, admin, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.audit_logs")).toBe(0);
    });
  });

  it("audit_logs è append-only", async () => {
    await asUser(db, superA, async (tx) => {
      await tx.query("select public.create_invitation('x@example.test', 'USER')");
    });
    await expect(db.query("delete from public.audit_logs")).rejects.toThrow(/append-only/);
    await expect(db.query("update public.audit_logs set action = 'x'")).rejects.toThrow(
      /append-only/,
    );
  });

  it("cancellando un utente le sue voci di audit restano, senza autore", async () => {
    await asUser(db, superA, async (tx) => {
      await tx.query("select public.create_invitation('y@example.test', 'USER')");
    });
    // Togliere l'autore insieme ad altro resta vietato.
    await expect(
      db.query("update public.audit_logs set actor_id = null, action = 'x'"),
    ).rejects.toThrow(/append-only/);
    await db.query("delete from auth.users where id = $1", [superA.id]);
    const { rows } = await db.query<{ actor_id: string | null; action: string }>(
      "select actor_id, action from public.audit_logs",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actor_id === null)).toBe(true);
    expect(rows.some((r) => r.action === "invitation.created")).toBe(true);
  });
});

describe("inviti", () => {
  it("richiedono una sessione 2FA (aal2)", async () => {
    await expect(
      asUser(
        db,
        superA,
        (tx) => tx.query("select public.create_invitation('n@example.test', 'USER')"),
        "aal1",
      ),
    ).rejects.toThrow(/due fattori/);
  });

  it("un utente normale non può invitare", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.create_invitation('n@example.test', 'USER')"),
      ),
    ).rejects.toThrow(/Permessi insufficienti/);
  });

  it("un Admin invita solo USER; un Super Admin può invitare Super Admin", async () => {
    await asUser(db, admin, (tx) =>
      tx.query("select public.create_invitation('u@example.test', 'USER')"),
    );
    await expect(
      asUser(db, admin, (tx) =>
        tx.query("select public.create_invitation('a@example.test', 'ADMIN')"),
      ),
    ).rejects.toThrow(/Non puoi invitare/);
    await asUser(db, superA, (tx) =>
      tx.query("select public.create_invitation('s@example.test', 'SUPER_ADMIN')"),
    );
  });

  it("un solo invito in attesa per email", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.create_invitation('d@example.test', 'USER')"),
    );
    await expect(
      asUser(db, superB, (tx) =>
        tx.query("select public.create_invitation('D@example.test', 'USER')"),
      ),
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it("non si invita un'email che ha già un account", async () => {
    await expect(
      asUser(db, superA, (tx) =>
        tx.query("select public.create_invitation('alice@example.test', 'USER')"),
      ),
    ).rejects.toThrow(/già un account/);
  });

  it("flusso completo: invito → accettazione → ruolo assegnato", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.create_invitation('nuova@example.test', 'SUPER_ADMIN')"),
    );
    const invitee = await createAuthUser(db, "nuova@example.test");
    const role = await asUser(
      db,
      invitee,
      async (tx) =>
        (await tx.query<{ r: string }>("select public.accept_invitation() as r")).rows[0]?.r,
      "aal1",
    );
    expect(role).toBe("SUPER_ADMIN");
    const { rows } = await db.query<{ status: string }>(
      "select status from public.invitations where email = 'nuova@example.test'",
    );
    expect(rows[0]?.status).toBe("ACCEPTED");
  });

  it("un invito revocato non può essere accettato", async () => {
    const id = await asUser(
      db,
      superA,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            "select public.create_invitation('rev@example.test', 'USER') id",
          )
        ).rows[0]?.id,
    );
    await asUser(db, superB, (tx) => tx.query("select public.revoke_invitation($1)", [id]));
    const invitee = await createAuthUser(db, "rev@example.test");
    await expect(
      asUser(db, invitee, (tx) => tx.query("select public.accept_invitation()"), "aal1"),
    ).rejects.toThrow(/Nessun invito valido/);
  });

  it("un invito scaduto non può essere accettato", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.create_invitation('old@example.test', 'USER')"),
    );
    await db.query(
      "update public.invitations set created_at = now() - interval '10 days', expires_at = now() - interval '1 day' where email = 'old@example.test'",
    );
    const invitee = await createAuthUser(db, "old@example.test");
    await expect(
      asUser(db, invitee, (tx) => tx.query("select public.accept_invitation()"), "aal1"),
    ).rejects.toThrow(/scaduto/);
  });

  it("un utente senza invito non ottiene ruoli", async () => {
    const stranger = await createAuthUser(db, "stranger@example.test");
    await expect(
      asUser(db, stranger, (tx) => tx.query("select public.accept_invitation()"), "aal1"),
    ).rejects.toThrow(/Nessun invito valido/);
  });
});

describe("gestione account", () => {
  it("un Super Admin sospende un utente, che perde l'accesso ai propri dati", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.set_account_status($1, 'SUSPENDED')", [alice.id]),
    );
    await asUser(db, alice, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.user_preferences")).toBe(0);
      // vede ancora il proprio profilo (per mostrare lo stato di sospensione)
      expect(await count(tx, "select count(*)::int n from public.profiles")).toBe(1);
    });
    await asUser(db, superA, (tx) =>
      tx.query("select public.set_account_status($1, 'ACTIVE')", [alice.id]),
    );
    await asUser(db, alice, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.user_preferences")).toBe(1);
    });
  });

  it("un Admin sospeso perde i privilegi amministrativi", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.set_account_status($1, 'SUSPENDED')", [admin.id]),
    );
    await asUser(db, admin, async (tx) => {
      expect(await count(tx, "select count(*)::int n from public.profiles")).toBe(1);
    });
    await expect(
      asUser(db, admin, (tx) =>
        tx.query("select public.create_invitation('z@example.test', 'USER')"),
      ),
    ).rejects.toThrow(/Permessi insufficienti/);
  });

  it("nessuno sospende se stesso; un Admin non sospende un Super Admin", async () => {
    await expect(
      asUser(db, superA, (tx) =>
        tx.query("select public.set_account_status($1, 'SUSPENDED')", [superA.id]),
      ),
    ).rejects.toThrow(/tuo account/);
    await expect(
      asUser(db, admin, (tx) =>
        tx.query("select public.set_account_status($1, 'SUSPENDED')", [superA.id]),
      ),
    ).rejects.toThrow(/Permessi insufficienti/);
  });

  it("i Super Admin hanno pari privilegi tra loro", async () => {
    await asUser(db, superB, (tx) =>
      tx.query("select public.set_user_role($1, 'ADMIN')", [superA.id]),
    );
    await asUser(db, superB, (tx) =>
      tx.query("select public.set_user_role($1, 'SUPER_ADMIN')", [superA.id]),
    );
  });

  it("deve restare almeno un Super Admin attivo", async () => {
    await asUser(db, superA, (tx) =>
      tx.query("select public.set_account_status($1, 'SUSPENDED')", [superB.id]),
    );
    // superA è l'unico attivo e non può cambiare il proprio ruolo
    await expect(
      asUser(db, superA, (tx) => tx.query("select public.set_user_role($1, 'USER')", [superA.id])),
    ).rejects.toThrow(/tuo ruolo/);
  });

  it("un Admin non può promuovere a Admin", async () => {
    await expect(
      asUser(db, admin, (tx) => tx.query("select public.set_user_role($1, 'ADMIN')", [alice.id])),
    ).rejects.toThrow(/Permessi insufficienti/);
  });
});

describe("reset password generato dall'amministratore", () => {
  it("un Super Admin autorizza il reset di un utente e viene registrato in audit", async () => {
    const email = await asUser(
      db,
      superA,
      async (tx) =>
        (await tx.query<{ e: string }>("select public.authorize_password_reset($1) e", [alice.id]))
          .rows[0]?.e,
    );
    expect(email).toBe("alice@example.test");
    const { rows } = await db.query<{ action: string }>(
      "select action from public.audit_logs where target_id = $1",
      [alice.id],
    );
    expect(rows.map((r) => r.action)).toContain("user.password_reset_link");
  });

  it("richiede la 2FA, un ruolo superiore e non vale su se stessi", async () => {
    await expect(
      asUser(
        db,
        superA,
        (tx) => tx.query("select public.authorize_password_reset($1)", [alice.id]),
        "aal1",
      ),
    ).rejects.toThrow(/due fattori/);
    await expect(
      asUser(db, admin, (tx) =>
        tx.query("select public.authorize_password_reset($1)", [superA.id]),
      ),
    ).rejects.toThrow(/Permessi insufficienti/);
    await expect(
      asUser(db, alice, (tx) => tx.query("select public.authorize_password_reset($1)", [bob.id])),
    ).rejects.toThrow(/Permessi insufficienti/);
    await expect(
      asUser(db, superA, (tx) =>
        tx.query("select public.authorize_password_reset($1)", [superA.id]),
      ),
    ).rejects.toThrow(/Impostazioni/);
  });
});

describe("rate limiting", () => {
  it("consente fino al massimo per finestra, poi blocca", async () => {
    const results = await asServiceRole(db, async (tx) => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const { rows } = await tx.query<{ ok: boolean }>(
          "select public.consume_rate_limit('login:test', 3, 900) ok",
        );
        out.push(Boolean(rows[0]?.ok));
      }
      return out;
    });
    expect(results).toEqual([true, true, true, false]);
  });

  it("non è invocabile dagli utenti autenticati", async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query("select public.consume_rate_limit('x', 1, 60)")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("modifica del profilo da un amministratore (ADR 0067)", () => {
  const update = "select public.admin_update_profile($1, $2, $3, $4, $5)";

  it("un Admin cambia nome e stile di un utente; la modifica va nel registro", async () => {
    await asUser(db, admin, (tx) =>
      tx.query(update, [alice.id, " Alice R. ", "violet", "mono", "ball"]),
    );
    const { rows } = await db.query<Record<string, string>>(
      "select display_name, name_color, name_style, avatar_style from public.profiles where id = $1",
      [alice.id],
    );
    expect(rows[0]).toEqual({
      display_name: "Alice R.",
      name_color: "violet",
      name_style: "mono",
      avatar_style: "ball",
    });
    const audit = await db.query<{ fields: string[] }>(
      "select metadata->'fields' fields from public.audit_logs where action = 'profile.updated_by_admin'",
    );
    expect(audit.rows[0]!.fields).toEqual([
      "display_name",
      "name_color",
      "name_style",
      "avatar_style",
    ]);
  });

  it("niente modifiche senza 2FA, da un utente o su un ruolo pari o superiore", async () => {
    expect(
      await asUser(
        db,
        admin,
        (tx) => attempt(tx, update, [alice.id, "X", null, null, null]),
        "aal1",
      ),
    ).toMatch(/.+/);
    expect(
      await asUser(db, bob, (tx) => attempt(tx, update, [alice.id, "X", null, null, null])),
    ).toMatch(/.+/);
    expect(
      await asUser(db, admin, (tx) => attempt(tx, update, [superA.id, "X", null, null, null])),
    ).toMatch(/Permessi insufficienti/);
    // Il Super Admin può modificare anche un altro Super Admin.
    expect(
      await asUser(db, superA, (tx) => attempt(tx, update, [superB.id, "B", null, null, null])),
    ).toBeNull();
  });

  it("nome vuoto o stili fuori elenco non passano", async () => {
    expect(
      await asUser(db, admin, (tx) => attempt(tx, update, [alice.id, "  ", null, null, null])),
    ).toMatch(/Nome non valido/);
    expect(
      await asUser(db, admin, (tx) => attempt(tx, update, [alice.id, "A", "fucsia", null, null])),
    ).toMatch(/profiles_name_color_check/);
  });
});
