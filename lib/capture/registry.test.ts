import { describe, expect, it } from "vitest";
import { ENTITY_REGISTRY, TYPED_KINDS, classificationForTyped, emptyValues, pickPostBody, type TypedKind } from "./registry";

/**
 * The registry is the whitelist (MYC-161). A POST route accepts exactly
 * `postFields`; every one of those keys must be a field the registry knows,
 * or the form and the route have drifted apart.
 */
describe("entity registry", () => {
  const kinds = Object.keys(ENTITY_REGISTRY) as TypedKind[];

  it("every POST whitelist key is a registry field", () => {
    const drift: string[] = [];
    for (const kind of kinds) {
      const def = ENTITY_REGISTRY[kind];
      const names = new Set(def.fields.map((f) => f.name));
      for (const k of def.postFields) if (!names.has(k)) drift.push(`${kind}.${k}`);
    }
    expect(drift, "POST whitelist keys with no registry field").toEqual([]);
  });

  it("a route implies a whitelist and a body builder, and vice versa", () => {
    for (const kind of kinds) {
      const def = ENTITY_REGISTRY[kind];
      if (def.route) {
        expect(def.postFields.length, `${kind} has a route but no postFields`).toBeGreaterThan(0);
        expect(typeof def.toPostBody, `${kind} has a route but no toPostBody`).toBe("function");
      } else {
        expect(def.postFields.length, `${kind} has postFields but no route`).toBe(0);
      }
    }
  });

  it("the primary field exists, is visible and is required", () => {
    for (const kind of kinds) {
      const def = ENTITY_REGISTRY[kind];
      const f = def.fields.find((x) => x.name === def.primary);
      expect(f, `${kind}.primary`).toBeTruthy();
      expect(f?.hidden, `${kind}.primary is hidden`).toBeFalsy();
    }
  });

  it("field names are unique per entry", () => {
    for (const kind of kinds) {
      const names = ENTITY_REGISTRY[kind].fields.map((f) => f.name);
      expect(new Set(names).size, kind).toBe(names.length);
    }
  });

  it("every classifier kind has a registry entry", () => {
    const classifierKinds = ["task", "note", "decision", "idea", "journal", "workout", "purchase", "pain_log", "reminder", "media", "account", "quote"];
    for (const k of classifierKinds) expect(kinds, k).toContain(k);
    for (const k of TYPED_KINDS) expect(kinds).toContain(k);
  });

  it("toPostBody only emits whitelisted keys", () => {
    for (const kind of kinds) {
      const def = ENTITY_REGISTRY[kind];
      if (!def.toPostBody) continue;
      const body = def.toPostBody(emptyValues(def, { [def.primary]: "x", project_id: "", said_by_person_id: "__me", media_type: "watch", date: "2026-01-01", time: "09:00" }));
      for (const k of Object.keys(body)) expect(def.postFields, `${kind} emits ${k}`).toContain(k);
    }
  });

  it("pickPostBody drops unknown keys", () => {
    expect(pickPostBody("purchase", { title: "milk", evil: 1, amount: 2 })).toEqual({ title: "milk", amount: 2 });
  });

  it("an empty form fails validation on its primary field", () => {
    for (const kind of kinds) {
      const def = ENTITY_REGISTRY[kind];
      const errors = def.validate(emptyValues(def));
      expect(Object.keys(errors).length, `${kind} accepted an empty form`).toBeGreaterThan(0);
    }
  });

  it("a typed classification carries the base shape and the typed marker", () => {
    const c = classificationForTyped("purchase", { title: "milk", amount: "1.5", list_type: "shopping" }, "milk");
    expect(c.kind).toBe("purchase");
    expect(c.typed).toBe(true);
    expect(c.typed_kind).toBe("purchase");
    expect((c.purchase as { amount: number }).amount).toBe(1.5);
    expect(Array.isArray(c.mentions)).toBe(true);
    const t = classificationForTyped("ticket", { title: "fix it", project_id: "p1" }, "fix it");
    expect(t.kind).toBe("task");
    expect(t.project_id).toBe("p1");
  });
});
