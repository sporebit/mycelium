/**
 * vCard read and write (people-contacts C6, C7).
 *
 * Reading: `vcf` parses 2.1 / 3.0 / 4.0, unfolds lines, keeps property
 * groups (item1.TEL + item1.X-ABLabel) and PHOTO. It leaves
 * quoted-printable values encoded, so this module decodes them (with the
 * CHARSET when given). The raw card text is kept per card so the export can
 * carry through what Mycelium does not model.
 *
 * Writing: vCard 3.0 for iPhone / iCloud — UTF-8, CRLF, lines folded at 75
 * octets, UID kept, custom labels as itemN.TEL + itemN.X-ABLabel, and every
 * unmodelled property of the original card copied as-is (Mycelium's own
 * fields win: N, FN, TEL, EMAIL, BDAY, UID).
 *
 * Pure: no I/O, so the round trip is unit-tested on its own.
 */
import vCard from "vcf";
import { createHash } from "crypto";
import { labelFromTypes, normalisePhone, typesForLabel } from "./phones";

export type ParsedPhone = { raw: string; e164: string | null; label: string; types: string[] };
export type ParsedEmail = { value: string; label: string; types: string[] };

export type ParsedCard = {
  /** The card's own UID, or a stable content hash when it has none (idempotent re-import, C2). */
  uid: string;
  uidFromCard: boolean;
  version: string;
  fn: string;
  n: { family: string; given: string; additional: string; prefix: string; suffix: string };
  phones: ParsedPhone[];
  emails: ParsedEmail[];
  birthday: string | null;
  address: string | null;
  org: string | null;
  hasPhoto: boolean;
  /** The card exactly as it was in the file (unfolded lines re-joined with CRLF). */
  raw: string;
};

export type ParseResult = { cards: ParsedCard[]; unparseable: number };

/** Properties Mycelium models; everything else is carried through from the raw card on export. */
export const MODELLED = new Set(["BEGIN", "END", "VERSION", "N", "FN", "TEL", "EMAIL", "BDAY", "UID", "REV", "PRODID", "X-ABLABEL"]);

// ---------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------

function decodeQp(value: string, charset: string | undefined): string {
  const bytes: number[] = [];
  const s = value.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "=" && i + 2 < s.length + 1 && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // literal characters are ASCII in QP; keep their code point as a byte
      const code = ch.charCodeAt(0);
      if (code < 128) bytes.push(code);
      else for (const b of Buffer.from(ch, "utf8")) bytes.push(b);
    }
  }
  const cs = (charset ?? "utf-8").toLowerCase();
  const enc = cs === "iso-8859-1" || cs === "latin1" ? "latin1" : "utf8";
  return Buffer.from(bytes).toString(enc);
}

type Prop = { valueOf(): unknown; group?: string; type?: string | string[]; encoding?: string; charset?: string; label?: string };

function propValue(p: Prop | undefined): string {
  if (!p) return "";
  const v = String(p.valueOf() ?? "");
  const enc = String(p.encoding ?? "").toLowerCase();
  return enc === "quoted-printable" ? decodeQp(v, p.charset) : v;
}

function list(v: unknown): Prop[] {
  if (!v) return [];
  return Array.isArray(v) ? (v as Prop[]) : [v as Prop];
}

function typesOf(p: Prop): string[] {
  const t = p.type;
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).flatMap((x) => String(x).split(",")).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

/** Unescape a vCard text value: \, \; \n. */
function unescapeText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function splitStructured(s: string): string[] {
  // split on unescaped semicolons
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      cur += s[i] + s[i + 1];
      i++;
    } else if (s[i] === ";") {
      out.push(cur);
      cur = "";
    } else cur += s[i];
  }
  out.push(cur);
  return out.map(unescapeText);
}

/** Split a file into raw card texts, tolerating LF-only files and stray blank lines. */
export function splitCards(text: string): { raw: string[]; unparseable: number } {
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const raw: string[] = [];
  let unparseable = 0;
  const re = /BEGIN:VCARD\n([\s\S]*?)(?:END:VCARD)(?=\n|$)/gi;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(norm))) {
    raw.push(`BEGIN:VCARD\n${m[1]}END:VCARD`.replace(/\n/g, "\r\n"));
    consumed = re.lastIndex;
  }
  // a BEGIN without an END is an unparseable tail
  const tail = norm.slice(consumed);
  if (/BEGIN:VCARD/i.test(tail)) unparseable += (tail.match(/BEGIN:VCARD/gi) ?? []).length;
  return { raw, unparseable };
}

/** A stable id for a card with no UID: the content, minus volatile lines, hashed. */
export function contentUid(rawCard: string): string {
  const stable = rawCard
    .replace(/\r\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((l) => !/^(REV|PRODID|X-ABUID|UID):/i.test(l))
    .join("\n");
  return `mycelium-${createHash("sha1").update(stable).digest("hex").slice(0, 24)}`;
}

function labelByGroup(card: vCard): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of list(card.get("xAbLabel"))) {
    if (p.group) out.set(p.group.toLowerCase(), propValue(p).replace(/^_\$!<(.*)>!\$_$/, "$1"));
  }
  return out;
}

export function parseCard(rawCard: string): ParsedCard | null {
  let card: vCard;
  try {
    const parsed = vCard.parse(rawCard);
    if (!parsed.length) return null;
    card = parsed[0];
  } catch {
    return null;
  }
  const labels = labelByGroup(card);
  const version = String(card.version ?? propValue(list(card.get("version"))[0]) ?? "3.0");
  const nParts = splitStructured(propValue(list(card.get("n"))[0]));
  const n = {
    family: (nParts[0] ?? "").trim(),
    given: (nParts[1] ?? "").trim(),
    additional: (nParts[2] ?? "").trim(),
    prefix: (nParts[3] ?? "").trim(),
    suffix: (nParts[4] ?? "").trim(),
  };
  const fnRaw = unescapeText(propValue(list(card.get("fn"))[0])).trim();
  const fn = fnRaw || [n.given, n.family].filter(Boolean).join(" ").trim();
  const phones: ParsedPhone[] = [];
  for (const p of list(card.get("tel"))) {
    const raw = propValue(p).trim();
    if (!raw) continue;
    const types = typesOf(p);
    const custom = p.group ? labels.get(p.group.toLowerCase()) : undefined;
    const { e164 } = normalisePhone(raw);
    phones.push({ raw, e164, label: custom ?? labelFromTypes(types, "phone"), types });
  }
  const emails: ParsedEmail[] = [];
  for (const p of list(card.get("email"))) {
    const value = propValue(p).trim();
    if (!value) continue;
    const types = typesOf(p);
    const custom = p.group ? labels.get(p.group.toLowerCase()) : undefined;
    emails.push({ value, label: custom ?? labelFromTypes(types, "email"), types });
  }
  const bdayRaw = propValue(list(card.get("bday"))[0]).trim();
  let birthday: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(bdayRaw)) birthday = bdayRaw.slice(0, 10);
  else if (/^\d{8}$/.test(bdayRaw)) birthday = `${bdayRaw.slice(0, 4)}-${bdayRaw.slice(4, 6)}-${bdayRaw.slice(6, 8)}`;
  const adr = list(card.get("adr"))[0];
  const address = adr ? splitStructured(propValue(adr)).map((x) => x.trim()).filter(Boolean).join(", ") || null : null;
  const org = unescapeText(propValue(list(card.get("org"))[0])).replace(/;+$/, "").trim() || null;
  const uidRaw = propValue(list(card.get("uid"))[0]).trim();
  if (!fn && phones.length === 0 && emails.length === 0) return null;
  return {
    uid: uidRaw || contentUid(rawCard),
    uidFromCard: !!uidRaw,
    version,
    fn,
    n,
    phones,
    emails,
    birthday,
    address,
    org,
    hasPhoto: list(card.get("photo")).length > 0,
    raw: rawCard,
  };
}

export function parseVcf(text: string): ParseResult {
  const { raw, unparseable } = splitCards(text);
  const cards: ParsedCard[] = [];
  let bad = unparseable;
  for (const r of raw) {
    const c = parseCard(r);
    if (c) cards.push(c);
    else bad += 1;
  }
  return { cards, unparseable: bad };
}

// ---------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------

export type ExportPhone = { number_raw: string; number_e164: string | null; label: string | null };
export type ExportEmail = { email: string; label: string | null };
export type ExportPerson = {
  uid: string;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  birthday: string | null;
  phones: ExportPhone[];
  emails: ExportEmail[];
  /** The raw card this person was imported from, if any: its unmodelled lines are carried through. */
  raw: string | null;
};

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Fold one logical line at 75 octets (RFC 2426 §2.6), never inside a UTF-8 sequence. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > limit) {
      out.push(cur);
      cur = " " + ch;
      bytes = 1 + n;
      limit = 75;
      continue;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** The unmodelled lines of a raw card, unfolded, in their original order. */
export function carriedLines(raw: string | null): string[] {
  if (!raw) return [];
  const unfolded = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: string[] = [];
  for (const line of unfolded) {
    const m = /^(?:[A-Za-z0-9-]+\.)?([A-Za-z0-9-]+)[;:]/.exec(line);
    if (!m) continue;
    const name = m[1].toUpperCase();
    if (MODELLED.has(name)) continue;
    out.push(line);
  }
  return out;
}

export function buildCard(p: ExportPerson): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  const first = p.first_name.trim();
  const last = (p.last_name ?? "").trim();
  const fn = (p.display_name ?? "").trim() || [first, last].filter(Boolean).join(" ") || "Unknown";
  lines.push(`N:${escapeText(last)};${escapeText(first)};;;`);
  lines.push(`FN:${escapeText(fn)}`);
  let item = 0;
  for (const ph of p.phones) {
    const value = ph.number_e164 ?? ph.number_raw;
    const types = typesForLabel(ph.label, "phone");
    if (types) {
      lines.push(`TEL;TYPE=${types.join(",")}:${value}`);
    } else {
      item += 1;
      lines.push(`item${item}.TEL:${value}`);
      lines.push(`item${item}.X-ABLabel:${escapeText(ph.label ?? "other")}`);
    }
  }
  for (const em of p.emails) {
    const types = typesForLabel(em.label, "email");
    if (types) {
      lines.push(`EMAIL;TYPE=INTERNET,${types.join(",")}:${em.email}`);
    } else {
      item += 1;
      lines.push(`item${item}.EMAIL;TYPE=INTERNET:${em.email}`);
      lines.push(`item${item}.X-ABLabel:${escapeText(em.label ?? "other")}`);
    }
  }
  if (p.birthday && /^\d{4}-\d{2}-\d{2}$/.test(p.birthday)) lines.push(`BDAY:${p.birthday}`);
  // carried-through properties keep their own itemN groups; renumber past ours to avoid a clash
  for (const line of carriedLines(p.raw)) {
    const m = /^item(\d+)\./i.exec(line);
    if (m) lines.push(line.replace(/^item\d+\./i, `item${item + Number(m[1])}.`));
    else lines.push(line);
  }
  lines.push(`UID:${p.uid}`);
  lines.push(`REV:${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function buildVcf(people: ExportPerson[]): string {
  return people.map(buildCard).join("");
}
