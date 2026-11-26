/**
 * Generatore dei tipi TypeScript del database (formato `Database` di Supabase), letto dal
 * catalogo di Postgres dopo aver applicato tutte le migrazioni su PGlite. Niente Docker né
 * rete: `supabase gen types` richiederebbe uno dei due. Lo usa `db-types.test.ts`, che
 * confronta il risultato con `packages/shared-types/src/database.ts`.
 *
 * Copre lo schema `public`: tabelle, viste, funzioni (argomenti e risultato), enum e chiavi
 * esterne (per le letture annidate di PostgREST). Tipi Postgres → TypeScript come
 * `supabase gen types`: bigint e numeric sono `number`, json e jsonb `Json`.
 */
import type { PGlite } from "@electric-sql/pglite";

const SCALARS: Record<string, string> = {
  bool: "boolean",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  oid: "number",
  json: "Json",
  jsonb: "Json",
  text: "string",
  varchar: "string",
  bpchar: "string",
  citext: "string",
  uuid: "string",
  date: "string",
  time: "string",
  timetz: "string",
  timestamp: "string",
  timestamptz: "string",
  interval: "string",
  inet: "string",
  cidr: "string",
  bytea: "string",
  name: "string",
  void: "undefined",
};

interface TypeInfo {
  oid: number;
  name: string;
  schema: string;
  type: string;
  elem: number;
}

const q = (s: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : JSON.stringify(s));

export async function generateDatabaseTypes(db: PGlite): Promise<string> {
  const types = new Map<number, TypeInfo>();
  for (const t of (
    await db.query<TypeInfo>(
      `select t.oid::int as oid, t.typname as name, n.nspname as schema, t.typtype as type,
              t.typelem::int as elem
       from pg_type t join pg_namespace n on n.oid = t.typnamespace`,
    )
  ).rows)
    types.set(t.oid, t);

  const enums = (
    await db.query<{ name: string; labels: string[] }>(
      `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
       from pg_type t join pg_namespace n on n.oid = t.typnamespace
       join pg_enum e on e.enumtypid = t.oid
       where n.nspname = 'public' group by t.typname order by t.typname`,
    )
  ).rows;

  const tsType = (oid: number): string => {
    const t = types.get(oid);
    if (!t) return "unknown";
    if (t.name.startsWith("_") && t.elem) return `${tsType(t.elem)}[]`;
    if (t.type === "e" && t.schema === "public")
      return `Database["public"]["Enums"][${JSON.stringify(t.name)}]`;
    if (t.type === "d") return "unknown";
    return SCALARS[t.name] ?? "unknown";
  };

  const columns = (
    await db.query<{
      rel: string;
      kind: string;
      col: string;
      typ: number;
      notnull: boolean;
      hasdefault: boolean;
      identity: string;
      generated: string;
    }>(
      `select c.relname as rel, c.relkind::text as kind, a.attname as col, a.atttypid::int as typ,
              a.attnotnull as notnull, a.atthasdef as hasdefault, a.attidentity::text as identity,
              a.attgenerated::text as generated
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       order by c.relname, a.attnum`,
    )
  ).rows;

  const fks = (
    await db.query<{
      name: string;
      rel: string;
      cols: string[];
      ref: string;
      refcols: string[];
      unique: boolean;
    }>(
      `select con.conname as name, c.relname as rel,
              array(select a.attname from unnest(con.conkey) with ordinality k(n, i)
                    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as cols,
              rc.relname as ref,
              array(select a.attname from unnest(con.confkey) with ordinality k(n, i)
                    join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as refcols,
              exists (select 1 from pg_index ix where ix.indrelid = con.conrelid and ix.indisunique
                      and (ix.indkey::int2[])::int2[] @> con.conkey and cardinality(con.conkey) = ix.indnatts) as unique
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
       order by c.relname, con.conname`,
    )
  ).rows;

  const functions = (
    await db.query<{
      name: string;
      argnames: string[] | null;
      argtypes: number[];
      argmodes: string[] | null;
      ndefaults: number;
      ret: number;
      retset: boolean;
      allargtypes: number[] | null;
    }>(
      `select p.proname as name, p.proargnames as argnames, p.proargtypes::int[] as argtypes,
              p.proargmodes::text[] as argmodes, p.pronargdefaults::int as ndefaults,
              p.prorettype::int as ret, p.proretset as retset, p.proallargtypes::int[] as allargtypes
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and p.prorettype <> 'trigger'::regtype
       order by p.proname, p.oid`,
    )
  ).rows;

  const relations = new Map<string, { kind: string; cols: typeof columns }>();
  for (const c of columns) {
    const r = relations.get(c.rel) ?? { kind: c.kind, cols: [] };
    r.cols.push(c);
    relations.set(c.rel, r);
  }

  const out: string[] = [];
  out.push("// Generato da supabase/tests/db-types.ts: non modificare a mano.");
  out.push("// Aggiornamento: pnpm --filter @predictra/database gen:types");
  out.push("");
  out.push(
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
  );
  out.push("");
  out.push("export type Database = {");
  out.push("  public: {");

  const relationshipsOf = (rel: string) => {
    const list = fks.filter((f) => f.rel === rel);
    if (list.length === 0) return "[]";
    return `[\n${list
      .map(
        (f) =>
          `          {\n            foreignKeyName: ${JSON.stringify(f.name)};\n            columns: ${JSON.stringify(f.cols)};\n            isOneToOne: ${f.unique};\n            referencedRelation: ${JSON.stringify(f.ref)};\n            referencedColumns: ${JSON.stringify(f.refcols)};\n          },`,
      )
      .join("\n")}\n        ]`;
  };

  const block = (title: string, kinds: string[], withWrites: boolean) => {
    const names = [...relations].filter(([, r]) => kinds.includes(r.kind)).map(([n]) => n);
    if (names.length === 0) {
      out.push(`    ${title}: { [_ in never]: never };`);
      return;
    }
    out.push(`    ${title}: {`);
    for (const name of names) {
      const r = relations.get(name)!;
      out.push(`      ${q(name)}: {`);
      out.push("        Row: {");
      for (const c of r.cols) {
        const nullable = !c.notnull || !withWrites;
        out.push(`          ${q(c.col)}: ${tsType(c.typ)}${nullable ? " | null" : ""};`);
      }
      out.push("        };");
      if (withWrites) {
        for (const mode of ["Insert", "Update"] as const) {
          out.push(`        ${mode}: {`);
          for (const c of r.cols) {
            const type = `${tsType(c.typ)}${c.notnull ? "" : " | null"}`;
            if (c.generated === "s" || c.identity === "a") {
              out.push(`          ${q(c.col)}?: never;`);
            } else {
              const optional =
                mode === "Update" || !c.notnull || c.hasdefault || c.identity === "d";
              out.push(`          ${q(c.col)}${optional ? "?" : ""}: ${type};`);
            }
          }
          out.push("        };");
        }
      }
      out.push(`        Relationships: ${relationshipsOf(name)};`);
      out.push("      };");
    }
    out.push("    };");
  };

  block("Tables", ["r", "p"], true);
  block("Views", ["v", "m"], false);

  // Funzioni: Args e Returns; le funzioni con lo stesso nome (overload) diventano un'unione.
  const byName = new Map<string, string[]>();
  for (const f of functions) {
    const modes = f.argmodes ?? f.argtypes.map(() => "i");
    const all = f.allargtypes ?? f.argtypes;
    const names = f.argnames ?? [];
    const inputs: string[] = [];
    const outputs: string[] = [];
    const firstDefault = f.argtypes.length - f.ndefaults;
    let inputIndex = 0;
    modes.forEach((mode, i) => {
      const n = names[i] ?? `arg${i}`;
      const t = tsType(all[i]!);
      if (mode === "i" || mode === "b" || mode === "v") {
        const optional = inputIndex >= firstDefault;
        // Postgres accetta NULL per ogni argomento (l'app ne passa di proposito).
        inputs.push(`${q(n)}${optional ? "?" : ""}: ${t} | null`);
        inputIndex++;
      }
      if (mode === "o" || mode === "b" || mode === "t") outputs.push(`${q(n)}: ${t} | null`);
    });
    const args = inputs.length ? `{ ${inputs.join("; ")} }` : "Record<PropertyKey, never>";
    let returns: string;
    if (outputs.length) returns = `{ ${outputs.join("; ")} }[]`;
    else {
      const rt = types.get(f.ret);
      const rel = rt && relations.get(rt.name);
      const row = rel
        ? `{ ${rel.cols.map((c) => `${q(c.col)}: ${tsType(c.typ)}${c.notnull ? "" : " | null"}`).join("; ")} }`
        : tsType(f.ret);
      returns = f.retset ? `${row}[]` : row;
    }
    const list = byName.get(f.name) ?? [];
    list.push(`{ Args: ${args}; Returns: ${returns} }`);
    byName.set(f.name, list);
  }
  if (byName.size === 0) out.push("    Functions: { [_ in never]: never };");
  else {
    out.push("    Functions: {");
    for (const [name, variants] of byName) out.push(`      ${q(name)}: ${variants.join(" | ")};`);
    out.push("    };");
  }

  if (enums.length === 0) out.push("    Enums: { [_ in never]: never };");
  else {
    out.push("    Enums: {");
    for (const e of enums)
      out.push(`      ${q(e.name)}: ${e.labels.map((l) => JSON.stringify(l)).join(" | ")};`);
    out.push("    };");
  }
  out.push("    CompositeTypes: { [_ in never]: never };");
  out.push("  };");
  out.push("};");
  out.push("");
  return out.join("\n");
}
