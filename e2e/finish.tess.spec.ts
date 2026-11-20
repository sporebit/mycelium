/**
 * The finish line (research rule 22), end to end, as Tess (her space is
 * quiet, so the line is made of this spec's tickets and nothing else):
 * at most three things that are four-fifths done or more, what is left on
 * each, and the three exits.
 *
 * Progress is seeded by SQL on tickets this spec made: a checklist with
 * some steps ticked, or sub-tasks moved to Done through the app.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";

const RUN = `E2E-finish-${Date.now().toString(36)}`;
type Item = { id: string; key: string | null; title: string; ratio: number; left: string; next_step: string | null; idle_days: number };

const made: string[] = [];
let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
});

test.afterAll(async () => {
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")}) or parent_task_id in (${made.map((i) => `'${i}'`).join(",")})`);
  await api.dispose();
});

test.beforeEach(() => {
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")}) or parent_task_id in (${made.map((i) => `'${i}'`).join(",")})`);
  made.length = 0;
});

async function ticket(title: string, fields: Record<string, unknown> = {}): Promise<{ id: string; key: string }> {
  const res = await api.post("/api/tickets", { data: { title: `${RUN} ${title}`, category: "doing", ...fields } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string; ticket_key: string }; task?: { id: string; ticket_key: string } };
  const t = body.ticket ?? body.task!;
  if (!fields.parent_task_id) made.push(t.id);
  return { id: t.id, key: t.ticket_key };
}

/** Give a ticket a checklist of `total` steps with the first `done` ticked. */
function checklist(id: string, done: number, total: number): void {
  const steps = Array.from({ length: total }, (_, i) => ({ id: `1.${i + 1}`, title: `Step ${i + 1}` }));
  const state = { toggles: {}, answers: {}, steps: Object.fromEntries(steps.slice(0, done).map((s) => [s.id, { done: true, at: "2026-11-01T10:00:00Z" }])) };
  const def = { kind: "guide", title: "E2E", phases: [{ id: "1", title: "Phase", steps }] };
  localSql(`update public.tickets set steps_definition = '${JSON.stringify(def)}'::jsonb, steps_state = '${JSON.stringify(state)}'::jsonb where id = '${id}'`);
}

const category = (id: string) => localSql(`select s.category from public.tickets t join public.ticket_statuses s on s.id = t.status_id where t.id = '${id}'`)[0]?.[0] ?? null;

async function line(): Promise<Item[]> {
  const res = await api.get("/api/daily/finish");
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { items: Item[] }).items.filter((i) => i.title.startsWith(RUN));
}

async function exit(ticketId: string, how: string) {
  const res = await api.post("/api/daily/finish", { data: { ticket_id: ticketId, exit: how } });
  return { status: res.status(), body: (await res.json()) as { ok: boolean; items?: Item[]; error?: string } };
}

test("only what is four-fifths done shows, nearest first, three at most, with what is left", async () => {
  const eight = await ticket("eight of ten");
  checklist(eight.id, 8, 10);
  const all = await ticket("all ticked, not closed");
  checklist(all.id, 6, 6);
  const nine = await ticket("nine of ten", { next_step: "Screw the last hinge on." });
  checklist(nine.id, 9, 10);
  localSql(`update public.tickets set next_step = 'Screw the last hinge on.' where id = '${nine.id}'`);
  const half = await ticket("half done");
  checklist(half.id, 5, 10);
  await ticket("nothing to measure");
  const four = await ticket("a fourth that is near");
  checklist(four.id, 4, 5);

  const items = await line();
  expect(items.map((i) => i.id)).toEqual([all.id, nine.id, eight.id]);
  expect(items[0]).toMatchObject({ ratio: 1, left: "Every step is done. Closing it is all that is left." });
  expect(items[1]).toMatchObject({ ratio: 0.9, left: "1 step left of 10.", next_step: "Screw the last hinge on." });
  expect(items[2]).toMatchObject({ ratio: 0.8, left: "2 steps left of 10." });
});

test("sub-tasks count: four of five done is on the line, and a dropped sub-task is not counted", async () => {
  const parent = await ticket("shed");
  const kids = [];
  for (const n of [1, 2, 3, 4, 5, 6]) kids.push(await ticket(`shed part ${n}`, { parent_task_id: parent.id, category: "next" }));
  for (const k of kids.slice(0, 4)) expect((await api.post(`/api/tickets/${k.key}/move`, { data: { category: "done" } })).status()).toBe(200);
  // One dropped: four of the five that remain are done.
  expect((await api.post(`/api/tickets/${kids[5].key}/move`, { data: { category: "cancelled" } })).status()).toBe(200);

  const items = await line();
  expect(items.map((i) => i.id)).toEqual([parent.id]);
  expect(items[0]).toMatchObject({ ratio: 0.8, left: "1 sub-task left of 5." });
});

test("the three exits: Finish closes it, Good enough closes it and records what was left, Drop lets it go", async () => {
  const a = await ticket("finish me");
  checklist(a.id, 9, 10);
  const b = await ticket("good enough");
  checklist(b.id, 8, 10);
  const c = await ticket("drop me");
  checklist(c.id, 4, 5);

  const first = await exit(a.id, "finish");
  expect(first.status).toBe(200);
  expect(category(a.id)).toBe("done");
  expect(first.body.items!.map((i) => i.id)).not.toContain(a.id);

  expect((await exit(b.id, "good_enough")).status).toBe(200);
  expect(category(b.id)).toBe("done");
  expect(localSql(`select parked_note from public.tickets where id = '${b.id}'`)[0][0]).toBe("Closed as good enough. 2 steps left of 10.");

  expect((await exit(c.id, "drop")).status).toBe(200);
  expect(category(c.id)).toBe("cancelled");
  expect(await line()).toEqual([]);
});

test("an exit is only for something on the line: not a far-from-done ticket, a made-up id, or an unknown exit", async () => {
  const far = await ticket("far from done");
  checklist(far.id, 2, 10);
  expect((await exit(far.id, "finish")).status).toBe(404);
  expect(category(far.id)).toBe("doing");
  expect((await exit("00000000-0000-4000-8000-000000000000", "drop")).status).toBe(404);
  const near = await ticket("near");
  checklist(near.id, 9, 10);
  expect((await exit(near.id, "delete")).status).toBe(400);
  expect(category(near.id)).toBe("doing");
});

test("the page: one card each, the three buttons, and closing one says so", async ({ page }) => {
  const a = await ticket("on the page");
  checklist(a.id, 9, 10);
  await page.goto("/finish");
  const view = page.getByTestId("finish-line");
  const card = view.getByTestId("finish-item").filter({ hasText: "on the page" });
  await expect(card.getByText("1 step left of 10.")).toBeVisible();
  for (const name of ["Finish", "Good enough — close as is", "Drop"]) await expect(card.getByRole("button", { name, exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(view.getByTestId("finish-closed")).toHaveText("One closed.");
  await expect(view.getByTestId("finish-item").filter({ hasText: "on the page" })).toHaveCount(0);
  expect(category(a.id)).toBe("done");
  await expect(page.locator("body")).not.toContainText(/overdue|missed|you still haven|don't forget/i);
});

test("the dashboard links to Today, the finish line and the close", async ({ page }) => {
  await page.goto("/");
  const links = page.getByTestId("loop-links");
  await expect(links.getByRole("link", { name: /Today/ })).toHaveAttribute("href", "/today");
  await expect(links.getByRole("link", { name: /Finish line/ })).toHaveAttribute("href", "/finish");
  await expect(links.getByRole("link", { name: /Close the day/ })).toHaveAttribute("href", "/close");
});
