import { describe, expect, it } from "vitest";
import { localSql } from "@/lib/access/introspect";
import { LEGACY_USER_ID, PHIL_AUTH_UID, legacyUserIdToAuthUid } from "./identity";

/**
 * The legacy-id → auth-uid mapping exists twice on purpose (SQL for Part 2's
 * backfill, TypeScript for everything else). This proves they agree. Like the
 * registry test it FAILS, not skips, when the local stack is down.
 */
describe("legacy identity mapping", () => {
  it("TypeScript resolves phil to the fixed uid and nothing else", () => {
    expect(legacyUserIdToAuthUid(LEGACY_USER_ID)).toBe(PHIL_AUTH_UID);
    expect(legacyUserIdToAuthUid("someone-else")).toBeNull();
    expect(legacyUserIdToAuthUid("")).toBeNull();
    expect(PHIL_AUTH_UID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("SQL app.legacy_user_uid agrees with the TypeScript constant", () => {
    const [[uid]] = localSql(`select app.legacy_user_uid('${LEGACY_USER_ID}')`);
    expect(uid).toBe(PHIL_AUTH_UID);
    const [[unknown]] = localSql("select coalesce(app.legacy_user_uid('nobody')::text, 'null')");
    expect(unknown).toBe("null");
  });

  it("the seeded local instance owner has that uid", () => {
    const rows = localSql(
      "select id from public.profiles where is_instance_owner order by id",
    );
    expect(rows.map((r) => r[0])).toEqual([PHIL_AUTH_UID]);
  });
});
