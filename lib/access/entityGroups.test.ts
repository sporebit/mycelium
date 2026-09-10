import { describe, expect, it } from "vitest";
import { localSql } from "./introspect";
import { entityGroupSeedRows } from "./registry";

/**
 * Migration 0103 seeds public.entity_groups with the registry's rows. RLS
 * policies (Part 3) key on that table; the app keys on this file. This
 * proves they are the same data, against the local stack (fails, not
 * skips, when it is down).
 */
describe("entity_groups table matches the registry", () => {
  it("has exactly the registry's rows", () => {
    const rows = localSql(
      "select table_name, section, entity_group from public.entity_groups order by table_name",
    ).map(([table_name, section, entity_group]) => ({ table_name, section, entity_group }));
    const expected = [...entityGroupSeedRows()].sort((a, b) =>
      a.table_name.localeCompare(b.table_name),
    );
    expect(rows).toEqual(expected);
  });

  it("every registered table carries space_id and created_by, and no user_id", () => {
    const rows = localSql(
      "select eg.table_name, " +
        "bool_or(c.column_name = 'space_id') as has_space, " +
        "bool_or(c.column_name = 'created_by') as has_creator, " +
        "bool_or(c.column_name = 'user_id') as has_legacy " +
        "from public.entity_groups eg " +
        "join information_schema.columns c on c.table_schema = 'public' and c.table_name = eg.table_name " +
        "group by eg.table_name order by 1",
    );
    const bad = rows
      .filter(([, s, c, l]) => s !== "t" || c !== "t" || l !== "f")
      .map(([t]) => t);
    expect(bad).toEqual([]);
    expect(rows.length).toBe(entityGroupSeedRows().length);
  });
});
