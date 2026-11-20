import { describe, expect, it } from "vitest";
import { PERSON_TTL_MS, signPersonNote, verifyPersonNote } from "./personToken";

const SECRET = "test-secret-not-a-real-one";
const now = Date.parse("2026-11-20T12:00:00Z");
const note = { uid: "11111111-1111-4111-8111-111111111111", device: "dev-1", exp: now + PERSON_TTL_MS };

describe("the person note", () => {
  it("round-trips for the same device while it lasts", async () => {
    const v = await signPersonNote(SECRET, note);
    expect(await verifyPersonNote(SECRET, v, "dev-1", now)).toEqual(note);
    expect(await verifyPersonNote(SECRET, v, "dev-1", note.exp - 1)).toEqual(note);
  });
  it("runs out at ten minutes", async () => {
    const v = await signPersonNote(SECRET, note);
    expect(await verifyPersonNote(SECRET, v, "dev-1", note.exp)).toBeNull();
    expect(PERSON_TTL_MS).toBe(10 * 60_000);
  });
  it("is no use on another wall", async () => {
    const v = await signPersonNote(SECRET, note);
    expect(await verifyPersonNote(SECRET, v, "dev-2", now)).toBeNull();
  });
  it("fails on a changed person, a changed time, a wrong secret or junk", async () => {
    const v = await signPersonNote(SECRET, note);
    const [uid, dev, exp, sig] = v.split(".");
    expect(await verifyPersonNote(SECRET, `22222222-2222-4222-8222-222222222222.${dev}.${exp}.${sig}`, "dev-1", now)).toBeNull();
    expect(await verifyPersonNote(SECRET, `${uid}.${dev}.${Number(exp) + 60_000}.${sig}`, "dev-1", now)).toBeNull();
    expect(await verifyPersonNote("other", v, "dev-1", now)).toBeNull();
    expect(await verifyPersonNote(SECRET, "nonsense", "dev-1", now)).toBeNull();
    expect(await verifyPersonNote(SECRET, null, "dev-1", now)).toBeNull();
    expect(await verifyPersonNote(SECRET, "", "dev-1", now)).toBeNull();
  });
  it("is not a JWT (three parts and a header would be one)", async () => {
    const v = await signPersonNote(SECRET, note);
    expect(v.split(".").length).toBe(4);
    expect(v.startsWith("eyJ")).toBe(false);
  });
});
