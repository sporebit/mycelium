/**
 * Files dropped into PhirstMaxx: a screenshot of an Instagram post, a photo
 * of a sign, a PDF leaflet. One private bucket, "phirstmaxx", path
 * <space id>/<random>/<file name>; the bucket's rules read the space from
 * the first folder as the family bucket does (0171), so the upload is the
 * caller's own and is refused outside their team. The file is stored
 * BEFORE the drop row is written (spec §2.1: the raw payload first), and
 * removed again if the row is refused.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PM_BUCKET = "phirstmaxx";
/** Spec §5: an image or a PDF up to 15 MB. The host may stop a body sooner than this; then the sender keeps the drop and retries. */
export const MAX_DROP_FILE_BYTES = 15 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

export type DropFileKind = { mime: string; ext: string };

/** image/* or a PDF; null for anything else. */
export function dropFileKind(mime: string | null | undefined): DropFileKind | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (m === "application/pdf") return { mime: m, ext: "pdf" };
  if (m.startsWith("image/")) return { mime: m, ext: EXT[m] ?? (m.slice(6).replace(/[^a-z0-9]/g, "").slice(0, 8) || "img") };
  return null;
}

/** A file name safe for a storage path: ASCII letters, digits, dot and dash, with the right extension. */
export function safeFileName(name: string | null | undefined, kind: DropFileKind): string {
  const base = (name ?? "").split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "drop";
  return `${base}.${kind.ext}`;
}

export type StoredDropFile = { path: string; mime: string };
export type StoreResult = { ok: true; stored: StoredDropFile } | { ok: false; status: number; error: string };

export type DropFileInput = { bytes: ArrayBuffer | Buffer; mime: string | null | undefined; name?: string | null; size?: number };

export async function storeDropFile(db: SupabaseClient, spaceId: string, file: DropFileInput): Promise<StoreResult> {
  const kind = dropFileKind(file.mime);
  if (!kind) return { ok: false, status: 415, error: "That kind of file is not kept here. Pictures and PDFs are." };
  const size = file.size ?? file.bytes.byteLength;
  if (size === 0) return { ok: false, status: 400, error: "The file is empty." };
  if (size > MAX_DROP_FILE_BYTES) return { ok: false, status: 413, error: "That file is over 15 MB. A smaller copy will go through." };
  const path = `${spaceId}/${randomUUID()}/${safeFileName(file.name, kind)}`;
  const body = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
  const { error } = await db.storage.from(PM_BUCKET).upload(path, body, { contentType: kind.mime, upsert: false });
  if (error) {
    console.error("[phirstmaxx] file not stored:", error.message);
    return { ok: false, status: /row-level|policy|not allowed|unauthor/i.test(error.message) ? 403 : 500, error: "The file could not be stored." };
  }
  return { ok: true, stored: { path, mime: kind.mime } };
}

export async function removeDropFiles(db: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(PM_BUCKET).remove(paths);
  if (error) console.error("[phirstmaxx] file not removed:", error.message);
}

/** A multipart form split into its text fields and its one `file`. */
export function readDropForm(form: FormData): { fields: Record<string, string>; file: File | null } {
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  const f = form.get("file");
  return { fields, file: f instanceof File && f.size > 0 ? f : null };
}

/** The request body as fields plus an optional file, whether JSON or multipart. Null when it is neither. */
export async function readDropBody(req: Request): Promise<{ fields: Record<string, unknown>; file: File | null } | null> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return null;
    const { fields, file } = readDropForm(form);
    return { fields, file };
  }
  const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json || typeof json !== "object") return null;
  return { fields: json, file: null };
}
