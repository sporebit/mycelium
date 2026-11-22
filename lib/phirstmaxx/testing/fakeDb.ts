/**
 * Just enough of the Supabase client for the PhirstMaxx unit tests: tables
 * are arrays, the query builder is the handful of calls the modules make,
 * `rpc` and `storage` are stubs the test fills in. No network, no database.
 * Modelled on lib/family/calendar/sync.test.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export type FakeDb = {
  tables: Record<string, Row[]>;
  rpcCalls: Array<{ name: string; args: Row }>;
  rpcAnswer: (name: string, args: Row) => unknown;
  files: Record<string, Uint8Array>;
  client: SupabaseClient;
  reset(): void;
};

let nextId = 1;
export const newId = (prefix = "id") => `${prefix}${nextId++}`;

const cmp = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
};

export function makeFakeDb(initial: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map((r) => ({ ...r }));
  const fake: FakeDb = {
    tables,
    rpcCalls: [],
    rpcAnswer: () => null,
    files: {},
    client: null as unknown as SupabaseClient,
    reset() {
      for (const k of Object.keys(tables)) tables[k] = [];
    },
  };

  function query(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: string[] | null = null;
    let ignoreDup = false;
    let head = false;
    let count = false;
    const order: Array<{ col: string; asc: boolean }> = [];
    let limit: number | null = null;
    let wantRows = false;

    const matched = () => {
      let out = rows().filter((r) => filters.every((f) => f(r)));
      for (const o of [...order].reverse()) out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]));
      if (limit !== null) out = out.slice(0, limit);
      return out;
    };
    const insertOne = (p: Row): Row | { error: Row } => {
      const row: Row = { id: newId(), created_at: new Date().toISOString(), ...p };
      if (table === "jobs" && row.dedupe_key && rows().some((r) => r.dedupe_key === row.dedupe_key)) return { error: { code: "23505", message: "dup" } };
      if (table === "pm_drops" && row.client_id && rows().some((r) => r.client_id === row.client_id && r.space_id === row.space_id)) return { error: { code: "23505", message: "dup" } };
      rows().push(row);
      return row;
    };
    const apply = (): Row[] | { error: Row } => {
      if (op === "select") return matched();
      if (op === "update") {
        const m = matched();
        for (const r of m) Object.assign(r, payload as Row);
        return m;
      }
      if (op === "delete") {
        const m = matched();
        for (const r of m) rows().splice(rows().indexOf(r), 1);
        return m;
      }
      const list = Array.isArray(payload) ? payload : [payload as Row];
      const out: Row[] = [];
      for (const p of list) {
        if (op === "upsert" && conflict) {
          const hit = rows().find((r) => conflict!.every((c) => (r[c] ?? null) === (p[c] ?? null)));
          if (hit) {
            if (!ignoreDup) Object.assign(hit, p);
            out.push(hit);
            continue;
          }
        }
        const r = insertOne(p);
        if ("error" in r && !("id" in r)) return r as { error: Row };
        out.push(r as Row);
      }
      return out;
    };

    const b: Record<string, unknown> = {};
    const chain = (fn: () => void) => () => {
      fn();
      return b;
    };
    b.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (op !== "select") {
        wantRows = true;
        return b;
      }
      head = !!opts?.head;
      count = !!opts?.count;
      return b;
    };
    b.insert = (p: Row | Row[]) => {
      op = "insert";
      payload = p;
      return b;
    };
    b.upsert = (p: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      op = "upsert";
      payload = p;
      conflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
      ignoreDup = !!opts?.ignoreDuplicates;
      return b;
    };
    b.update = (p: Row) => {
      op = "update";
      payload = p;
      return b;
    };
    b.delete = () => {
      op = "delete";
      return b;
    };
    const val = (r: Row, col: string) => (col.includes("->>") ? ((r[col.split("->>")[0]] as Row | undefined)?.[col.split("->>")[1]] ?? null) : (r[col] ?? null));
    b.eq = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) === v))();
    b.neq = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== v))();
    b.in = (col: string, vs: unknown[]) => chain(() => filters.push((r) => vs.includes(val(r, col))))();
    b.is = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) === v))();
    b.not = (col: string, _op: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== v))();
    b.lt = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== null && cmp(val(r, col), v) < 0))();
    b.lte = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== null && cmp(val(r, col), v) <= 0))();
    b.gt = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== null && cmp(val(r, col), v) > 0))();
    b.gte = (col: string, v: unknown) => chain(() => filters.push((r) => val(r, col) !== null && cmp(val(r, col), v) >= 0))();
    b.like = (col: string, pattern: string) => chain(() => filters.push((r) => String(val(r, col) ?? "").startsWith(pattern.replace(/%$/, ""))))();
    b.order = (col: string, opts?: { ascending?: boolean }) => chain(() => order.push({ col, asc: opts?.ascending !== false }))();
    b.limit = (n: number) => chain(() => (limit = n))();
    const result = () => {
      const out = apply();
      if (!Array.isArray(out)) return { data: null, error: out.error, count: null };
      return { data: head ? null : out, error: null, count: count ? out.length : null };
    };
    b.maybeSingle = async () => {
      const r = result();
      return { ...r, data: r.data ? ((r.data as Row[])[0] ?? null) : null };
    };
    b.single = async () => {
      const r = result();
      const data = r.data ? (r.data as Row[])[0] : null;
      return { ...r, data, error: r.error ?? (data ? null : { message: "no row" }) };
    };
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      void wantRows;
      return Promise.resolve(result()).then(resolve, reject);
    };
    return b;
  }

  fake.client = {
    from: query,
    rpc: async (name: string, args: Row) => {
      fake.rpcCalls.push({ name, args });
      return { data: fake.rpcAnswer(name, args), error: null };
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          const bytes = fake.files[path];
          return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: "not found" } };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return fake;
}
