import { describe, expect, it } from "vitest";
import { buildCard, buildVcf, carriedLines, contentUid, foldLine, parseVcf, type ExportPerson } from "./vcard";
import { labelFromTypes, normalisePhone, typesForLabel } from "./phones";

/** Synthetic cards only — nothing here resembles a real contact. */
const THREE = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Testperson;Alpha;;;",
  "FN:Alpha Testperson",
  "TEL;TYPE=CELL:07700 900001",
  "item1.TEL:+44 20 7946 0001",
  "item1.X-ABLabel:Office direct",
  "EMAIL;TYPE=INTERNET,HOME:alpha@example.invalid",
  "BDAY:1990-01-02",
  "ORG:Example Widgets;",
  "NOTE:Met at the widget fair\\, 2019.",
  "UID:alpha-uid-0001",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Testperson;Bravo;;;",
  "FN:Bravo Testperson",
  "TEL;TYPE=WORK:+1 202 555 0100",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:M=C3=BCller;J=C3=BCrgen;;;",
  "FN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:J=C3=BCrgen M=C3=BCller",
  "TEL;CELL:07700 900002",
  "PHOTO;ENCODING=BASE64;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a",
  " HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA",
  "END:VCARD",
].join("\r\n");

describe("vCard parsing", () => {
  it("reads 3.0 and 2.1 cards, groups with X-ABLabel, and decodes quoted-printable", () => {
    const { cards, unparseable } = parseVcf(THREE);
    expect(unparseable).toBe(0);
    expect(cards).toHaveLength(3);
    const [a, b, c] = cards;
    expect(a.uid).toBe("alpha-uid-0001");
    expect(a.uidFromCard).toBe(true);
    expect(a.n).toMatchObject({ family: "Testperson", given: "Alpha" });
    expect(a.phones.map((p) => [p.e164, p.label])).toEqual([
      ["+447700900001", "mobile"],
      ["+442079460001", "Office direct"],
    ]);
    expect(a.emails).toEqual([{ value: "alpha@example.invalid", label: "home", types: ["INTERNET", "HOME"] }]);
    expect(a.birthday).toBe("1990-01-02");
    expect(a.org).toBe("Example Widgets");
    expect(b.uidFromCard).toBe(false);
    expect(b.uid.startsWith("mycelium-")).toBe(true);
    expect(b.phones[0]).toMatchObject({ e164: "+12025550100", label: "work" });
    expect(c.version).toBe("2.1");
    expect(c.fn).toBe("Jürgen Müller");
    expect(c.n.family).toBe("Müller");
    expect(c.hasPhoto).toBe(true);
    expect(c.phones[0].e164).toBe("+447700900002");
  });

  it("a content UID is stable across REV changes and re-parsing", () => {
    const one = ["BEGIN:VCARD", "VERSION:3.0", "FN:Same Person", "TEL:07700900003", "REV:2020-01-01T00:00:00Z", "END:VCARD"].join("\r\n");
    const two = one.replace("REV:2020-01-01T00:00:00Z", "REV:2026-09-25T10:00:00Z");
    expect(contentUid(one)).toBe(contentUid(two));
    expect(contentUid(one)).not.toBe(contentUid(one.replace("07700900003", "07700900004")));
  });

  it("tolerates LF-only files and counts an unterminated tail as unparseable", () => {
    const lf = THREE.replace(/\r\n/g, "\n") + "\nBEGIN:VCARD\nFN:Broken";
    const { cards, unparseable } = parseVcf(lf);
    expect(cards).toHaveLength(3);
    expect(unparseable).toBe(1);
  });
});

describe("phones", () => {
  it("normalises UK and international numbers to E.164 with GB as the default region", () => {
    expect(normalisePhone("07700 900123").e164).toBe("+447700900123");
    expect(normalisePhone("+44 (0)20 7946 0000").e164).toBe("+442079460000");
    expect(normalisePhone("020 7946 0000").e164).toBe("+442079460000");
    expect(normalisePhone("+1 202-555-0100").e164).toBe("+12025550100");
    expect(normalisePhone("not a number").e164).toBeNull();
    expect(normalisePhone("  ").raw).toBe("");
  });
  it("maps TYPEs to labels and back", () => {
    expect(labelFromTypes(["CELL", "VOICE"], "phone")).toBe("mobile");
    expect(labelFromTypes(["IPHONE", "CELL"], "phone")).toBe("iPhone");
    expect(labelFromTypes(["WORK"], "email")).toBe("work");
    expect(typesForLabel("mobile", "phone")).toEqual(["CELL"]);
    expect(typesForLabel("Office direct", "phone")).toBeNull();
  });
});

describe("vCard writing", () => {
  it("folds at 75 octets and never splits a multibyte character", () => {
    const line = "NOTE:" + "ü".repeat(60); // 5 + 120 bytes
    const folded = foldLine(line);
    for (const l of folded.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("FN:short")).toBe("FN:short");
  });

  it("writes custom labels as itemN.TEL + itemN.X-ABLabel and known ones as TYPE", () => {
    const card = buildCard({
      uid: "u-1",
      first_name: "Alpha",
      last_name: "Testperson",
      display_name: null,
      birthday: "1990-01-02",
      phones: [
        { number_raw: "07700 900001", number_e164: "+447700900001", label: "mobile" },
        { number_raw: "+44 20 7946 0001", number_e164: "+442079460001", label: "Office direct" },
      ],
      emails: [{ email: "alpha@example.invalid", label: "Newsletter" }],
      raw: null,
    });
    expect(card).toContain("TEL;TYPE=CELL:+447700900001\r\n");
    expect(card).toContain("item1.TEL:+442079460001\r\nitem1.X-ABLabel:Office direct\r\n");
    expect(card).toContain("item2.EMAIL;TYPE=INTERNET:alpha@example.invalid\r\nitem2.X-ABLabel:Newsletter\r\n");
    expect(card).toContain("N:Testperson;Alpha;;;\r\nFN:Alpha Testperson\r\n");
    expect(card).toContain("UID:u-1\r\n");
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
    expect(card.includes("\n") && !card.includes("\r\n\r\n")).toBe(true);
  });

  it("carries through unmodelled properties from the raw card, and Mycelium's fields win", () => {
    const { cards } = parseVcf(THREE);
    const a = cards[0];
    expect(carriedLines(a.raw).map((l) => l.split(/[;:]/)[0])).toEqual(["ORG", "NOTE"]);
    const card = buildCard({
      uid: a.uid,
      first_name: "Alpha",
      last_name: "Testperson",
      display_name: null,
      birthday: a.birthday,
      phones: [{ number_raw: "07700 900001", number_e164: "+447700900001", label: "mobile" }], // the office number dropped (not exported)
      emails: [],
      raw: a.raw,
    });
    expect(card).toContain("ORG:Example Widgets;");
    expect(card).toContain("NOTE:Met at the widget fair\\, 2019.");
    expect(card).not.toContain("+442079460001");
    expect(card).not.toContain("alpha@example.invalid");
    expect((card.match(/^TEL/gm) ?? []).length).toBe(1);
  });

  it("round-trips: import → export → re-import gives the same cards with UIDs kept", () => {
    const { cards } = parseVcf(THREE);
    const people: ExportPerson[] = cards.map((c) => ({
      uid: c.uid,
      first_name: c.n.given || c.fn,
      last_name: c.n.family || null,
      display_name: null,
      birthday: c.birthday,
      phones: c.phones.map((p) => ({ number_raw: p.raw, number_e164: p.e164, label: p.label })),
      emails: c.emails.map((e) => ({ email: e.value, label: e.label })),
      raw: c.raw,
    }));
    const out = buildVcf(people);
    const again = parseVcf(out);
    expect(again.unparseable).toBe(0);
    expect(again.cards).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const before = cards[i];
      const after = again.cards[i];
      expect(after.uid).toBe(before.uid);
      expect(after.uidFromCard).toBe(true);
      expect(after.fn).toBe(before.fn);
      expect(after.n.family).toBe(before.n.family);
      expect(after.n.given).toBe(before.n.given);
      expect(after.phones.map((p) => [p.e164, p.label])).toEqual(before.phones.map((p) => [p.e164, p.label]));
      expect(after.emails.map((e) => [e.value, e.label])).toEqual(before.emails.map((e) => [e.value, e.label]));
      expect(after.birthday).toBe(before.birthday);
      expect(after.version).toBe("3.0");
    }
    // the 2.1 card's photo travelled through as a carried line
    expect(again.cards[2].hasPhoto).toBe(true);
    // a third pass is byte-identical apart from REV
    const strip = (s: string) => s.replace(/^REV:.*\r\n/gm, "");
    const third = buildVcf(again.cards.map((c, i) => ({ ...people[i], raw: c.raw })));
    expect(strip(third)).toBe(strip(out));
  });
});
