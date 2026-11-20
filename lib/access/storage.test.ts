import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * Storage buckets follow the row they belong to (0158).
 *
 * Every private bucket stores its files under `<owning row id>/…`. A file is
 * reachable by exactly the people who can reach that row: the policies on
 * storage.objects look the row up, and the row's own RLS answers. Before
 * 0158 the tickets and daylog buckets checked only the bucket name, so any
 * signed-in user could list and download every file in them.
 *
 * Runs against the LOCAL stack through the Storage API, as a browser would.
 * Fails, not skips, when the stack is down.
 */

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const env = localStackEnv();
const RUN = `st${Date.now().toString(36)}`;
// A day nobody logs: one date in the 1800s per run, so a crashed run cannot block the next.
const FIXTURE_DAY = `18${String(10 + (Date.now() % 89))}-${String(1 + (Math.floor(Date.now() / 89) % 12)).padStart(2, "0")}-${String(1 + (Math.floor(Date.now() / 1068) % 28)).padStart(2, "0")}`;

const tokens = new Map<string, string>();
async function token(uid: string): Promise<string> {
  let t = tokens.get(uid);
  if (!t) {
    t = await mintUserJwt({ sub: uid, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    tokens.set(uid, t);
  }
  return t;
}
async function headers(uid: string, extra: Record<string, string> = {}) {
  return { apikey: env.anonKey, authorization: `Bearer ${await token(uid)}`, ...extra };
}
async function upload(uid: string, bucket: string, path: string, text = "x"): Promise<number> {
  const res = await fetch(`${env.apiUrl}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: await headers(uid, { "content-type": "text/plain" }),
    body: text,
  });
  await res.text();
  return res.status;
}
async function download(uid: string, bucket: string, path: string): Promise<number> {
  const res = await fetch(`${env.apiUrl}/storage/v1/object/authenticated/${bucket}/${path}`, { headers: await headers(uid) });
  await res.text();
  return res.status;
}
async function list(uid: string, bucket: string, prefix: string): Promise<string[]> {
  const res = await fetch(`${env.apiUrl}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: await headers(uid, { "content-type": "application/json" }),
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as Array<{ name: string }>).map((o) => o.name) : [];
}
async function remove(uid: string, bucket: string, path: string): Promise<number> {
  const res = await fetch(`${env.apiUrl}/storage/v1/object/${bucket}/${path}`, { method: "DELETE", headers: await headers(uid) });
  await res.text();
  return res.status;
}
async function sign(uid: string, bucket: string, path: string): Promise<number> {
  const res = await fetch(`${env.apiUrl}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: await headers(uid, { "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  await res.text();
  return res.status;
}

const space = (uid: string) => localSql(`select personal_space_id from public.profiles where id = '${uid}'`)[0][0];

type Owned = { bucket: string; rowId: string; file: string };
const philFiles: Owned[] = [];
const tessFiles: Owned[] = [];
const made: { table: string; id: string }[] = [];

function insertRow(table: string, columns: string, values: string): string {
  const id = localSql(`insert into public.${table} (${columns}) values (${values}) returning id`)[0][0];
  made.push({ table, id });
  return id;
}

beforeAll(async () => {
  const phil = space(PHIL_AUTH_UID);
  const tess = space(TESS);
  expect(tess, "Tess must exist; run the e2e global setup or the isolation test once").toBeTruthy();

  for (const [who, uid, sp, files] of [
    ["phil", PHIL_AUTH_UID, phil, philFiles],
    ["tess", TESS, tess, tessFiles],
  ] as const) {
    const ticket = insertRow("tickets", "title, space_id, created_by", `'${RUN} ${who} ticket', '${sp}', '${uid}'`);
    const day = insertRow("daylog_days", "day, space_id, created_by", `'${FIXTURE_DAY}', '${sp}', '${uid}'`);
    const receipt = insertRow("receipts", "space_id, created_by", `'${sp}', '${uid}'`);
    files.push(
      { bucket: "tickets", rowId: ticket, file: `${ticket}/${RUN}.txt` },
      { bucket: "daylog", rowId: day, file: `${day}/${RUN}.txt` },
      { bucket: "receipts", rowId: receipt, file: `${receipt}/${RUN}.txt` },
    );
  }
});

afterAll(async () => {
  // Files go through the Storage API with the service role (the storage
  // schema refuses direct deletes); rows go even if a file removal fails.
  const service = { apikey: env.serviceRoleKey, authorization: `Bearer ${env.serviceRoleKey}` };
  for (const f of [...philFiles, ...tessFiles]) {
    for (const name of [f.file, `${f.rowId}/${RUN}-intruder.txt`]) {
      await fetch(`${env.apiUrl}/storage/v1/object/${f.bucket}/${name}`, { method: "DELETE", headers: service }).catch(() => undefined);
    }
  }
  for (const bucket of ["tickets", "daylog", "receipts"]) {
    await fetch(`${env.apiUrl}/storage/v1/object/${bucket}/${RUN}-loose.txt`, { method: "DELETE", headers: service }).catch(() => undefined);
  }
  for (const m of made.reverse()) {
    try {
      localSql(`delete from public.${m.table} where id = '${m.id}'`);
    } catch {
      /* best effort: a leftover fixture row is harmless */
    }
  }
});

describe("storage buckets follow the owning row", () => {
  it("lets the owner upload, sign, download and list their own files", async () => {
    for (const f of philFiles) {
      expect(await upload(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} upload`).toBe(200);
      expect(await sign(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} sign`).toBe(200);
      expect(await download(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} download`).toBe(200);
      expect(await list(PHIL_AUTH_UID, f.bucket, `${f.rowId}/`), `${f.bucket} list`).toContain(`${RUN}.txt`);
    }
    for (const f of tessFiles) {
      expect(await upload(TESS, f.bucket, f.file), `${f.bucket} upload as Tess`).toBe(200);
    }
  });

  it("gives another user nothing: no list, no download, no signed link", async () => {
    for (const f of philFiles) {
      expect(await list(TESS, f.bucket, `${f.rowId}/`), `${f.bucket} list as Tess`).toEqual([]);
      expect(await list(TESS, f.bucket, ""), `${f.bucket} root list as Tess`).not.toContain(f.rowId);
      expect(await download(TESS, f.bucket, f.file), `${f.bucket} download as Tess`).not.toBe(200);
      expect(await sign(TESS, f.bucket, f.file), `${f.bucket} sign as Tess`).not.toBe(200);
    }
  });

  it("refuses another user's upload under a row that is not theirs, and their delete", async () => {
    for (const f of philFiles) {
      expect(await upload(TESS, f.bucket, `${f.rowId}/${RUN}-intruder.txt`), `${f.bucket} upload as Tess`).not.toBe(200);
      await remove(TESS, f.bucket, f.file);
      expect(await download(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} still there after Tess's delete`).toBe(200);
    }
  });

  it("refuses a file that sits under no row at all", async () => {
    for (const bucket of ["tickets", "daylog", "receipts"]) {
      expect(await upload(PHIL_AUTH_UID, bucket, `${RUN}-loose.txt`), `${bucket} loose upload`).not.toBe(200);
      expect(await upload(PHIL_AUTH_UID, bucket, `00000000-0000-4000-8000-000000000000/${RUN}.txt`), `${bucket} unknown row`).not.toBe(200);
    }
  });

  it("lets the owner delete their own file", async () => {
    for (const f of philFiles) {
      expect(await remove(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} delete`).toBe(200);
      expect(await download(PHIL_AUTH_UID, f.bucket, f.file), `${f.bucket} gone`).not.toBe(200);
    }
  });
});
