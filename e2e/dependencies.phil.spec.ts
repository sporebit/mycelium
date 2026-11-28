/**
 * Ticket dependencies both ways (tickets spec §3.2, §5): the API writes a
 * blocker, both tickets' pages show it, the list badge says "blocked", a
 * reverse pair is refused, a repeat is idempotent, and a delete clears it.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";

const RUN = `E2E-deps-${Date.now().toString(36)}`;
const made: string[] = [];
let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
});

test.afterAll(async () => {
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  await api.dispose();
});

async function ticket(title: string): Promise<{ id: string; key: string }> {
  const res = await api.post("/api/tickets", { data: { title: `${RUN} ${title}`, category: "backlog" } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string; ticket_key: string; key?: string }; task?: { id: string; ticket_key: string; key?: string } };
  const t = (body.ticket ?? body.task)!;
  made.push(t.id);
  return { id: t.id, key: t.ticket_key ?? t.key! };
}

test("a blocker is written once, read both ways, refused in reverse, and removed", async ({ page }) => {
  const a = await ticket("blocker");
  const b = await ticket("blocked");

  // b waits for a
  const first = await api.post(`/api/tickets/${b.key}/dependencies`, { data: { blocker: a.key } });
  expect(first.status(), await first.text()).toBe(201);
  const again = await api.post(`/api/tickets/${b.key}/dependencies`, { data: { blocker: a.key } });
  expect(again.status(), await again.text()).toBe(200);

  const fromB = (await (await api.get(`/api/tickets/${b.key}/dependencies`)).json()) as { blocked_by: Array<{ key: string }>; blocks: unknown[] };
  expect(fromB.blocked_by.map((t) => t.key)).toEqual([a.key]);
  expect(fromB.blocks).toEqual([]);
  const fromA = (await (await api.get(`/api/tickets/${a.key}/dependencies`)).json()) as { blocked_by: unknown[]; blocks: Array<{ key: string }> };
  expect(fromA.blocks.map((t) => t.key)).toEqual([b.key]);
  expect(fromA.blocked_by).toEqual([]);

  // the reverse pair would be a cycle
  const reverse = await api.post(`/api/tickets/${a.key}/dependencies`, { data: { blocker: b.key } });
  expect(reverse.status()).toBe(409);
  const self = await api.post(`/api/tickets/${a.key}/dependencies`, { data: { blocker: a.key } });
  expect(self.status()).toBe(400);

  // the list badge
  const list = (await (await api.get(`/api/tickets?category=backlog&limit=500`)).json()) as { tickets: Array<{ id: string; blocked_by?: string[] }> };
  expect(list.tickets.find((t) => t.id === b.id)?.blocked_by).toEqual([a.key]);

  // both pages show it
  await page.goto(`/work/browse/${b.key}`);
  const deps = page.getByTestId("dependencies");
  await expect(deps.getByRole("list", { name: "Blocked by" }).getByText(a.key)).toBeVisible();
  await page.goto(`/work/browse/${a.key}`);
  await expect(page.getByTestId("dependencies").getByRole("list", { name: "Blocks" }).getByText(b.key)).toBeVisible();

  // add one from the page: a holds up a third ticket
  const c = await ticket("third");
  await page.getByLabel("Direction").selectOption("blocks");
  await page.getByLabel("Other ticket key").fill(c.key);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("dependencies").getByRole("list", { name: "Blocks" }).getByText(c.key)).toBeVisible();

  // remove
  const gone = await api.delete(`/api/tickets/${b.key}/dependencies?blocker=${a.key}`);
  expect(gone.status(), await gone.text()).toBe(200);
  const after = (await (await api.get(`/api/tickets/${b.key}/dependencies`)).json()) as { blocked_by: unknown[] };
  expect(after.blocked_by).toEqual([]);
});
