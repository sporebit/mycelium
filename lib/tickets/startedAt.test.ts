import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "@/lib/access/introspect";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * 0139 started_at (tasks-merge spec M5): the status-sync trigger sets
 * `started_at` the first time a ticket's category enters doing, and never
 * overwrites it. Runs as postgres on the LOCAL stack; fails, not skips,
 * when the stack is down.
 */

const TITLE = "started-at-test: trigger";
let space = "";
let id = "";

function statusFor(category: string): string {
  return localSql(`select public.ticket_status_for('${space}', '${category}')`)[0][0];
}
function startedAt(): string | null {
  const v = localSql(`select coalesce(started_at::text, '-') from public.tickets where id = '${id}'`)[0][0];
  return v === '-' ? null : v;
}
function move(category: string): void {
  localSql(`update public.tickets set status_id = '${statusFor(category)}' where id = '${id}'`);
}

beforeAll(() => {
  space = localSql(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`)[0][0];
  localSql(`delete from public.tickets where title like 'started-at-test:%'`);
  id = localSql(
    `insert into public.tickets (title, space_id, created_by, owner) values ('${TITLE}', '${space}', '${PHIL_AUTH_UID}', '${PHIL_AUTH_UID}') returning id`,
  )[0][0];
});

afterAll(() => {
  localSql(`delete from public.tickets where title like 'started-at-test:%'`);
});

describe("tickets.started_at", () => {
  it("is null until the ticket enters doing", () => {
    expect(startedAt()).toBeNull();
    move("next");
    expect(startedAt()).toBeNull();
  });

  it("is set on the first entry into doing", () => {
    move("doing");
    const first = startedAt();
    expect(first).not.toBeNull();
    expect(localSql(`select status from public.tickets where id = '${id}'`)[0][0]).toBe("in_progress");
  });

  it("does not change when the ticket leaves and re-enters doing", async () => {
    const first = startedAt();
    move("waiting");
    expect(startedAt()).toBe(first);
    await new Promise((r) => setTimeout(r, 20));
    move("doing");
    expect(startedAt()).toBe(first);
    move("done");
    expect(startedAt()).toBe(first);
    expect(localSql(`select coalesce(completed_at::text, '-') from public.tickets where id = '${id}'`)[0][0]).not.toBe("-");
  });

  it("a legacy status write of in_progress also starts the ticket", () => {
    const other = localSql(
      `insert into public.tickets (title, space_id, created_by, owner) values ('${TITLE} legacy', '${space}', '${PHIL_AUTH_UID}', '${PHIL_AUTH_UID}') returning id`,
    )[0][0];
    expect(localSql(`select coalesce(started_at::text, '-') from public.tickets where id = '${other}'`)[0][0]).toBe("-");
    localSql(`update public.tickets set status = 'in_progress' where id = '${other}'`);
    expect(localSql(`select coalesce(started_at::text, '-') from public.tickets where id = '${other}'`)[0][0]).not.toBe("-");
  });
});
