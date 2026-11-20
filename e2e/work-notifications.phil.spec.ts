/**
 * Notifications, as Phil (MYC-174): the bell, the inbox (mark read, mark
 * unread, unread-only, delete, open), the Mentions list on Your work, and
 * Settings → Notifications (the channel × event grid and quiet hours).
 *
 * The rows are written straight to the table: in a space of one the app
 * never notifies anybody (the actor is never told), so there is no journey
 * that produces one. Everything seeded carries the run's tag and is removed
 * at the end. Phil's own settings are put back as they were.
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiAs, dropSeededNotifications, E2E_ORIGIN, expect, get, newRunId, patientHook, PHIL, seedNotification, send, tag, test, uuid, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);

type Notification = { id: string; title: string; read_at: string | null; event: string };
type Inbox = { notifications: Notification[]; unread: number };
type Settings = {
  prefs: { grid: Record<string, Record<string, boolean>>; quiet: { from: string; to: string } | null };
  is_owner: boolean;
  channels_available: { telegram: boolean; email: boolean; push: boolean };
};

let api: APIRequestContext;
let ticket: { id: string; key: string };
let before: Settings;
const ids = { mention: uuid(), assignment: uuid(), comment: uuid(), status: uuid() };

const inbox = () => get<Inbox>(api, "/api/work/notifications?limit=200");
const row = (page: Page, title: string): Locator => page.locator("li").filter({ hasText: title });

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(PHIL, 40);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 100);
  api = await apiAs(PHIL);
  before = await get<Settings>(api, "/api/work/notifications/settings");
  ticket = (await send<{ ticket: { id: string; key: string } }>(api, "POST", "/api/work/tickets", { title: `${TAG} notified` })).ticket;
  const url = `${E2E_ORIGIN}/work/browse/${ticket.key}`;
  seedNotification(PHIL, { id: ids.status, event: "status_change", title: `${TAG} moved to In Review`, body: "status body", url, ticketId: ticket.id, minutesAgo: 4 });
  seedNotification(PHIL, { id: ids.comment, event: "comment", title: `${TAG} has a new comment`, body: "comment body", url, ticketId: ticket.id, minutesAgo: 3 });
  seedNotification(PHIL, { id: ids.assignment, event: "assignment", title: `${TAG} was assigned to you`, body: "assignment body", url, ticketId: ticket.id, minutesAgo: 2 });
  seedNotification(PHIL, { id: ids.mention, event: "mention", title: `${TAG} mentions you`, body: "mention body", url, ticketId: ticket.id, minutesAgo: 1 });
});

test.afterAll(async () => {
  patientHook();
  dropSeededNotifications(RUN);
  await api.delete(`/api/work/tickets/${ticket.id}?hard=1`);
  // the grid and quiet hours as they were
  await api.patch("/api/work/notifications/settings", { data: { grid: before.prefs.grid, quiet: before.prefs.quiet } });
  await api.dispose();
});

test("the bell counts what is unread and leads to the inbox", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const { unread } = await inbox();
  expect(unread).toBeGreaterThanOrEqual(4);
  await page.goto("/work");
  const bell = page.getByRole("link", { name: `Notifications, ${unread} unread` });
  await expect(bell.first()).toBeVisible();
  await bell.first().click();
  await expect(page).toHaveURL(/\/work\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByText(`${unread} unread`, { exact: true })).toBeVisible();
  await w.check();
});

test("the inbox lists newest first, and a row is marked read, unread and deleted", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work/notifications");
  // newest first among the four this run seeded
  const mine = page.locator("li").filter({ hasText: TAG });
  await expect(mine).toHaveCount(4);
  await expect(mine.nth(0)).toContainText("mentions you");
  await expect(mine.nth(1)).toContainText("was assigned to you");
  await expect(mine.nth(2)).toContainText("has a new comment");
  await expect(mine.nth(3)).toContainText("moved to In Review");
  await expect(mine.nth(0)).toContainText("mention body");
  await expect(mine.nth(0)).toContainText(ticket.key);

  const start = (await inbox()).unread;
  const comment = row(page, `${TAG} has a new comment`);
  let patched = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications") && r.request().method() === "PATCH");
  await comment.getByRole("button", { name: "Read", exact: true }).click();
  expect((await patched).status()).toBe(200);
  await expect(comment.getByRole("button", { name: "Unread", exact: true })).toBeVisible();
  await expect(page.getByText(`${start - 1} unread`, { exact: true })).toBeVisible();
  expect((await inbox()).notifications.find((n) => n.id === ids.comment)?.read_at).not.toBeNull();

  // "Unread only" leaves the read one out
  await page.getByLabel("Unread only").check();
  await expect(row(page, `${TAG} has a new comment`)).toHaveCount(0);
  await expect(row(page, `${TAG} mentions you`)).toBeVisible();
  await page.getByLabel("Unread only").uncheck();

  // and back to unread
  patched = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications") && r.request().method() === "PATCH");
  await comment.getByRole("button", { name: "Unread", exact: true }).click();
  expect((await patched).status()).toBe(200);
  await expect(comment.getByRole("button", { name: "Read", exact: true })).toBeVisible();
  await expect(page.getByText(`${start} unread`, { exact: true })).toBeVisible();

  // delete: gone from the list, from the count, and after a reload
  const status = row(page, `${TAG} moved to In Review`);
  const deleted = page.waitForResponse((r) => r.url().includes(`/api/work/notifications?id=${ids.status}`) && r.request().method() === "DELETE");
  await status.getByRole("button", { name: "Delete notification" }).click();
  expect((await deleted).status()).toBe(200);
  await expect(status).toHaveCount(0);
  await expect(page.getByText(`${start - 1} unread`, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("li").filter({ hasText: TAG })).toHaveCount(3);
  expect((await inbox()).notifications.some((n) => n.id === ids.status)).toBe(false);
  await w.check();
});

test("opening a notification marks it read and goes to its ticket", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work/notifications");
  await row(page, `${TAG} was assigned to you`).getByRole("button", { name: new RegExp(`${TAG} was assigned to you`) }).click();
  await expect(page).toHaveURL(new RegExp(`/work/browse/${ticket.key}$`));
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} notified`);
  await expect.poll(async () => (await inbox()).notifications.find((n) => n.id === ids.assignment)?.read_at ?? null).not.toBeNull();
  await w.check();
});

test("a mention is listed on Your work", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work");
  const mentions = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Mentions/ }) });
  const link = mentions.getByRole("link", { name: new RegExp(`${TAG} mentions you`) });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/work/browse/${ticket.key}$`));
  await w.check();
});

test("Mark all read clears the count", async ({ page }, testInfo) => {
  const current = await inbox();
  const foreign = current.notifications.filter((n) => !n.read_at && !n.title.startsWith(TAG));
  // "all" would touch rows this run did not make
  test.skip(foreign.length > 0, `Phil has ${foreign.length} unread notification(s) from elsewhere; marking all read would change them`);
  const w = watch(page, testInfo);
  await page.goto("/work/notifications");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  expect((await inbox()).unread).toBe(0);
  // the bell drops its count
  await expect(page.getByRole("link", { name: "Notifications", exact: true }).first()).toBeVisible();
  await page.getByLabel("Unread only").check();
  await expect(page.getByText("Nothing unread")).toBeVisible();
  await w.check();
});

test("Settings: the channel × event grid saves, and an event switched off in the app leaves the inbox", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/other/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Notifications" }).click();
  const table = page.locator("table").filter({ hasText: "Someone mentions me" });
  await expect(table).toBeVisible();
  // four events by four channels
  await expect(table.getByRole("checkbox")).toHaveCount(16);
  for (const head of ["In the app", "Telegram", "Email", "Push"]) await expect(table.locator("th").filter({ hasText: head })).toBeVisible();
  // nothing outward-facing is configured on this server: those channels say "off" and cannot be ticked
  for (const [channel, on] of Object.entries(before.channels_available)) {
    const label = { telegram: "Telegram", email: "Email", push: "Push" }[channel]!;
    const box = table.getByRole("checkbox", { name: `Someone mentions me by ${label}` });
    if (on) await expect(box).toBeEnabled();
    else {
      await expect(box).toBeDisabled();
      await expect(table.locator("th").filter({ hasText: label })).toContainText("off");
    }
  }

  const cell = table.getByRole("checkbox", { name: "Someone comments on a ticket I watch by In the app" });
  await expect(cell).toBeChecked();
  let saved = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications/settings") && r.request().method() === "PATCH");
  // a click, not uncheck(): the box follows the saved setting, so it flips when the save answers
  await cell.click();
  expect((await saved).status()).toBe(200);
  await expect(cell).not.toBeChecked();
  const after = await get<Settings>(api, "/api/work/notifications/settings");
  expect(after.prefs.grid.comment.in_app).toBe(false);
  // only the cell that was sent changed
  expect(after.prefs.grid.mention).toEqual(before.prefs.grid.mention);

  // the inbox no longer shows comment events
  expect((await inbox()).notifications.some((n) => n.id === ids.comment)).toBe(false);
  await page.goto("/work/notifications");
  await expect(row(page, `${TAG} mentions you`)).toBeVisible();
  await expect(row(page, `${TAG} has a new comment`)).toHaveCount(0);

  // it survives a reload of Settings, and ticking it brings the row back
  await page.goto("/other/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Notifications" }).click();
  await expect(cell).not.toBeChecked();
  saved = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications/settings") && r.request().method() === "PATCH");
  await cell.click();
  expect((await saved).status()).toBe(200);
  await expect(cell).toBeChecked();
  expect((await inbox()).notifications.some((n) => n.id === ids.comment)).toBe(true);
  await w.check();
});

test("Settings: quiet hours are set, kept and cleared", async ({ page }, testInfo) => {
  test.skip(before.prefs.quiet !== null, "Phil already has quiet hours on this stack; the check starts from none");
  const w = watch(page, testInfo);
  await page.goto("/other/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Notifications" }).click();
  const from = page.getByLabel("Quiet from");
  const until = page.getByLabel("Quiet until");
  await expect(from).toHaveValue("");
  let saved = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications/settings") && r.request().method() === "PATCH");
  await from.fill("21:30");
  expect((await saved).status()).toBe(200);
  // the other end takes its default
  await expect(until).toHaveValue("07:00");
  saved = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications/settings") && r.request().method() === "PATCH");
  await until.fill("06:15");
  expect((await saved).status()).toBe(200);
  expect((await get<Settings>(api, "/api/work/notifications/settings")).prefs.quiet).toEqual({ from: "21:30", to: "06:15" });

  await page.reload();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Notifications" }).click();
  await expect(from).toHaveValue("21:30");
  await expect(until).toHaveValue("06:15");
  await expect(page.getByText("In the quiet window nothing goes to Telegram, email or push; the in-app list still fills.")).toBeVisible();

  saved = page.waitForResponse((r) => r.url().endsWith("/api/work/notifications/settings") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "clear", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(from).toHaveValue("");
  expect((await get<Settings>(api, "/api/work/notifications/settings")).prefs.quiet).toBeNull();

  // push cannot be subscribed where the instance has no key
  if (!before.channels_available.push) {
    await expect(page.getByRole("button", { name: "Subscribe this device" })).toBeDisabled();
    await expect(page.getByText(/push is not configured on this instance/)).toBeVisible();
  }
  await w.check();
});
