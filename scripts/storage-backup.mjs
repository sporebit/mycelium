#!/usr/bin/env node
/**
 * Copies every stored file (recordings, photos, receipt images, ticket
 * attachments) from the hosted file store to this PC.
 *
 * The nightly database dump holds the RECORD of each file (storage.objects)
 * but not the file: found by the restore test on 2026-11-20. This is the
 * other half. It is incremental: a file already here with the same size
 * and the same last-changed time is not fetched again, and nothing is ever
 * deleted from the copy, so a file removed in the app by mistake is still
 * here.
 *
 *   node scripts/storage-backup.mjs [--root "A:\Backups\mycelium\storage"] [--dry]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. Talks to Supabase only. Prints counts, never a file's
 * contents. Exit code 0 unless nothing at all could be listed.
 */
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = value("--root", "A:\\Backups\\mycelium\\storage");
const DRY = flag("--dry");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** A path from the store, made safe as a path on this disk: no climbing out of the folder, no characters Windows refuses. */
function localPath(bucket, name) {
  const parts = name.split("/").filter((p) => p && p !== "." && p !== "..").map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, "_"));
  return path.join(OUT, bucket.replace(/[<>:"|?*\\/]/g, "_"), ...parts);
}

/** Every file in a bucket, walking folders. A folder is an entry with no id. */
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(bucket, full)));
      else files.push({ name: full, size: entry.metadata?.size ?? null, updated: entry.updated_at ?? entry.created_at ?? null });
    }
    if (!data || data.length < 1000) break;
  }
  return files;
}

const { data: buckets, error: bucketsError } = await db.storage.listBuckets();
if (bucketsError || !buckets) {
  console.error(`error: could not list buckets: ${bucketsError?.message ?? "no answer"}`);
  process.exit(1);
}

let fetched = 0;
let kept = 0;
let failed = 0;
let bytes = 0;
const perBucket = [];
for (const b of buckets) {
  let files = [];
  try {
    files = await listAll(b.name);
  } catch (err) {
    failed += 1;
    console.error(`FAIL list ${b.name}: ${err instanceof Error ? err.message : err}`);
    continue;
  }
  let got = 0;
  for (const f of files) {
    const target = localPath(b.name, f.name);
    const when = f.updated ? new Date(f.updated) : null;
    if (existsSync(target)) {
      const st = statSync(target);
      const sameSize = f.size === null || st.size === f.size;
      const sameTime = !when || Math.abs(st.mtimeMs - when.getTime()) < 2000;
      if (sameSize && sameTime) {
        kept += 1;
        continue;
      }
    }
    if (DRY) {
      fetched += 1;
      got += 1;
      continue;
    }
    try {
      const { data, error } = await db.storage.from(b.name).download(f.name);
      if (error || !data) throw new Error(error?.message ?? "no data");
      const buf = Buffer.from(await data.arrayBuffer());
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, buf);
      if (when) utimesSync(target, when, when);
      fetched += 1;
      got += 1;
      bytes += buf.length;
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${b.name}/${f.name.split("/").length} parts: ${err instanceof Error ? err.message : err}`);
    }
  }
  perBucket.push(`${b.name} ${files.length}${got ? ` (+${got})` : ""}`);
}

console.log(`${failed ? "partial" : "ok"}: ${buckets.length} buckets; ${DRY ? "would fetch" : "fetched"} ${fetched} (${(bytes / 1024 / 1024).toFixed(1)} MB), already here ${kept}, failed ${failed}`);
console.log(`   ${perBucket.join(" · ") || "no files"}`);
console.log(`   into ${OUT}`);
