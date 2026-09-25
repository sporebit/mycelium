/**
 * Phone numbers (people-contacts C5): libphonenumber-js with GB as the
 * default region. A number we cannot parse keeps its raw text and no E.164;
 * it still exports, it just cannot match another card on the number.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type NormalisedPhone = { raw: string; e164: string | null };

export function normalisePhone(raw: string): NormalisedPhone {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { raw: "", e164: null };
  try {
    const parsed = parsePhoneNumberFromString(text, "GB");
    if (parsed && parsed.isPossible()) return { raw: text, e164: parsed.number };
  } catch {
    /* fall through */
  }
  return { raw: text, e164: null };
}

/** The label a vCard TYPE list implies, when the card carries no X-ABLabel. */
export function labelFromTypes(types: readonly string[], kind: "phone" | "email"): string {
  const t = types.map((x) => x.toLowerCase());
  if (kind === "phone") {
    if (t.includes("iphone")) return "iPhone";
    if (t.includes("cell") || t.includes("mobile")) return "mobile";
    if (t.includes("fax")) return "fax";
    if (t.includes("pager")) return "pager";
    if (t.includes("main")) return "main";
    if (t.includes("work")) return "work";
    if (t.includes("home")) return "home";
    return "mobile";
  }
  if (t.includes("work")) return "work";
  if (t.includes("home")) return "home";
  return "home";
}

/** The TYPE parameter to write for a label we recognise; a custom label goes through X-ABLabel instead. */
export function typesForLabel(label: string | null | undefined, kind: "phone" | "email"): string[] | null {
  const l = (label ?? "").trim().toLowerCase();
  if (kind === "phone") {
    if (l === "mobile") return ["CELL"];
    if (l === "iphone") return ["IPHONE", "CELL"];
    if (l === "home") return ["HOME"];
    if (l === "work") return ["WORK"];
    if (l === "main") return ["MAIN"];
    if (l === "fax") return ["FAX"];
    if (l === "pager") return ["PAGER"];
    return null;
  }
  if (l === "home") return ["HOME"];
  if (l === "work") return ["WORK"];
  return null;
}
