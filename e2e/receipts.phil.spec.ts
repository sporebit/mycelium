/**
 * Receipts, end to end, as Phil: upload, the parsed lines, line edits and
 * reconciliation, the title, participants, tagging and exact shares, balances
 * and settlements, removing a participant, reparse and add-photos with the
 * model switched off, merge, and delete.
 *
 * The seam. Reading a photograph is a cloud vision call and that is off on
 * this server, so an upload ends at status `failed` / `vision_call_failed`
 * (which is itself checked: 201, never a 5xx, the photo kept). There is no
 * API that writes lines, so the one place this spec uses SQL to write is
 * `enterParsedReceipt()`, which stores exactly what `parseReceipt()` stores
 * after the model answers: the line rows and the receipt's header figures.
 * Everything after that point is driven through the screen or the API.
 *
 * Expected money is worked out here from the rules the feature states
 * (docs/receipts-phase3-report.md, lib/receipts/shares.ts header), not by
 * calling the library:
 *   - a percentage share is worth line total x pct / 100, to the penny
 *   - a unit share is worth (line total / quantity) x units, to the penny
 *   - the owner holds no share: his part of a line is what is left, never
 *     below zero
 *   - tagging divides the line evenly between everyone tagged; a participant
 *     with a default share keeps it and the rest divide what is left; a unit
 *     share is left alone and its slice is not there to be divided
 *   - a receipt is `parsed` when its lines add up to within 5p of the printed
 *     total, `needs_review / total_mismatch` otherwise, `no_total` without one
 *   - a balance is owed (from the shares) less paid (the settlements)
 *
 * Everything created carries `E2E-receipts-<run>` and is removed afterwards.
 */
import { expect as baseExpect, test as base, type APIRequestContext, type APIResponse, type Locator, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";

/**
 * The server closes an idle connection after a few seconds, and a request
 * sent down it at that instant dies with ECONNRESET before reaching any
 * handler. Reads and idempotent writes are sent again; uploads and other
 * POSTs are not, so nothing can be created twice.
 */
function steady(api: APIRequestContext): APIRequestContext {
  const again = new Set<string | symbol>(["get", "patch", "put", "delete"]);
  return new Proxy(api, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      if (!again.has(prop)) return value.bind(target);
      return (url: string, options?: Record<string, unknown>) =>
        (value as (u: string, o: Record<string, unknown>) => unknown).call(target, url, { maxRetries: 2, ...options });
    },
  });
}

const test = base.extend({
  request: async ({ request }, use) => {
    await use(steady(request));
  },
});

// The dev server compiles a route the first time it is asked for it, and five
// suites share it; assertions get longer than the default to ride that out.
const expect = baseExpect.configure({ timeout: 30_000 });
const SLOW = 120_000;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const TAG = `E2E-receipts-${RUN}`;

/** A valid one-pixel PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

type SeedLine = {
  item_code: string | null;
  description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number;
};
type Line = { id: string; description: string; quantity: number; line_total: number; sort_order: number };
type Share = { person_id: string; share_pct: number | null; units: number | null; amount?: number };
type Detail = {
  receipt: {
    id: string;
    title: string | null;
    retailer: string | null;
    purchased_at: string | null;
    total: number | null;
    parsed_total: number | null;
    status: string;
    review_reason: string | null;
  };
  images: { id: string; sort_order: number; signed_url: string | null; storage_path: string }[];
  lines: Line[];
  participants: { person_id: string; default_share_pct: number | null; display_name: string }[];
  shares: (Share & { receipt_line_id: string })[];
};
type Balance = {
  person_id: string;
  display_name: string;
  owed: number;
  paid: number;
  outstanding: number;
  receipts: { receipt_id: string; owed: number }[];
};

// ------------------------------------------------------------------ fixtures

const GROCER = `${TAG} Grocer`;
const GROCER_DATE = "2031-03-14";
/** Printed total is a pound more than the lines, so the receipt arrives needing review. */
const GROCER_PRINTED_TOTAL = 31;
const GROCER_LINES: SeedLine[] = [
  { item_code: "E2E001", description: `${TAG} Olive oil`, quantity: 1, unit_price: 9, line_total: 9 },
  { item_code: null, description: `${TAG} Sparkling water`, quantity: 3, unit_price: 2.5, line_total: 7.5 },
  { item_code: null, description: `${TAG} Cheddar`, quantity: 1, unit_price: 10, line_total: 10 },
  { item_code: null, description: `${TAG} Bread`, quantity: 2, unit_price: 1.75, line_total: 3.5 },
];
const OIL = 0;
const WATER = 1;
const CHEDDAR = 2;
const BREAD = 3;

const BAKERY = `${TAG} Bakery`;
const BAKERY_LINES: SeedLine[] = [
  { item_code: null, description: `${TAG} Loaf`, quantity: 1, unit_price: 3.5, line_total: 3.5 },
  { item_code: null, description: `${TAG} Buns`, quantity: 6, unit_price: null, line_total: 2.5 },
];

const ADA = `Ada ${TAG}`;
const BO = `Bo ${TAG}`;
const CY = `Cy ${TAG}`;

// ------------------------------------------------------------ state and tidy

const made = {
  receipts: new Set<string>(),
  settlements: new Set<string>(),
  people: new Map<string, string>(), // name -> id
};
let grocerId = "";
let bakeryId = "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pence = (n: number) => Math.round(n * 100);
const sqlText = (s: string | null) => (s === null ? "null" : `'${s.replace(/'/g, "''")}'`);
const sqlNum = (n: number | null) => (n === null ? "null::numeric" : `${n}::numeric`);

/**
 * The parser's rule for a freshly read receipt, restated: the lines' sum to
 * the penny, and the status that sum earns against the printed total.
 */
function outcomeFor(lines: SeedLine[], printedTotal: number | null) {
  const sumPence = lines.reduce((s, l) => s + pence(l.line_total), 0);
  const parsed_total = sumPence / 100;
  if (printedTotal === null) return { parsed_total, status: "needs_review", review_reason: "no_total" };
  if (Math.abs(sumPence - pence(printedTotal)) > 5) {
    return { parsed_total, status: "needs_review", review_reason: "total_mismatch" };
  }
  return { parsed_total, status: "parsed", review_reason: null as string | null };
}

/**
 * The seam: store what parseReceipt() stores once the model has answered.
 * Only ever called for a receipt this spec uploaded.
 */
function enterParsedReceipt(
  id: string,
  parsed: { retailer: string; purchased_at: string; total: number | null; lines: SeedLine[] },
): void {
  if (!UUID.test(id) || !made.receipts.has(id)) throw new Error(`refusing to seed a receipt this spec did not create: ${id}`);
  const o = outcomeFor(parsed.lines, parsed.total);
  const values = parsed.lines
    .map(
      (l, i) =>
        `(${i}, ${sqlText(l.item_code)}::text, ${sqlText(l.description)}::text, ${sqlNum(l.quantity)}, ${sqlNum(l.unit_price)}, ${sqlNum(l.line_total)})`,
    )
    .join(", ");
  localSql(
    `delete from public.receipt_lines where receipt_id = '${id}'; ` +
      `insert into public.receipt_lines (receipt_id, sort_order, item_code, description, quantity, unit_price, line_total, raw_text, space_id, created_by) ` +
      `select r.id, v.sort_order, v.item_code, v.description, v.quantity, v.unit_price, v.line_total, v.description, r.space_id, r.created_by ` +
      `from public.receipts r, (values ${values}) as v(sort_order, item_code, description, quantity, unit_price, line_total) where r.id = '${id}'; ` +
      `update public.receipts set retailer = ${sqlText(parsed.retailer)}, purchased_at = ${sqlText(parsed.purchased_at)}, currency = 'GBP', ` +
      `total = ${sqlNum(parsed.total)}, parsed_total = ${sqlNum(o.parsed_total)}, status = ${sqlText(o.status)}, ` +
      `review_reason = ${sqlText(o.review_reason)}, raw_parse = '{"e2e": true}'::jsonb, updated_at = now() where id = '${id}'`,
  );
}

function photos(n: number, type = "image/png", ext = "png"): FormData {
  const form = new FormData();
  for (let i = 0; i < n; i++) form.append("images", new File([PNG], `${TAG}-${i}.${ext}`, { type }));
  return form;
}

async function uploadByApi(api: APIRequestContext, n = 1): Promise<string> {
  const res = await api.post("/api/receipts", { multipart: photos(n), timeout: SLOW });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { receipt: { id: string } }).receipt.id;
  made.receipts.add(id);
  return id;
}

async function detail(api: APIRequestContext, id: string): Promise<Detail> {
  const res = await api.get(`/api/receipts/${id}`, { timeout: SLOW });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Detail;
}

async function balances(api: APIRequestContext): Promise<Balance[]> {
  const res = await api.get("/api/receipts/balances", { timeout: SLOW });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { balances: Balance[] }).balances;
}

async function person(api: APIRequestContext, firstName: string): Promise<string> {
  const res = await api.post("/api/people", { data: { first_name: firstName, last_name: TAG }, timeout: SLOW });
  expect(res.status(), await res.text()).toBe(200);
  const id = ((await res.json()) as { person: { id: string } }).person.id;
  made.people.set(`${firstName} ${TAG}`, id);
  return id;
}

const personId = (name: string): string => {
  const id = made.people.get(name);
  if (!id) throw new Error(`no person ${name}`);
  return id;
};

/** Shares on one line, keyed by person, as the API prices them. */
async function sharesOn(api: APIRequestContext, receiptId: string, lineId: string) {
  const res = await api.get(`/api/receipts/${receiptId}/lines/${lineId}/shares`, { timeout: SLOW });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { shares: Share[]; owner_remainder: number };
  return { byPerson: new Map(body.shares.map((s) => [s.person_id, s])), owner: body.owner_remainder, count: body.shares.length };
}

async function json<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

// ------------------------------------------------------------- page helpers

/** Runs `action` and returns the app's own request that it causes. */
async function during(page: Page, method: string, path: RegExp, action: () => Promise<unknown>) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname), { timeout: SLOW }),
    action(),
  ]);
  return res;
}

/** Finance privacy is on after every full page load; this is the owner's own shortcut for lifting it. */
async function revealMoney(page: Page): Promise<void> {
  await expect(page.getByText("•••.••").first()).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+Shift+H");
  await expect(page.getByText("•••.••")).toHaveCount(0);
}

/** The value under one of the small capital labels (RECEIPT TOTAL, OWED, YOURS…). */
const figure = (scope: Page | Locator, label: string): Locator => scope.getByText(label, { exact: true }).locator("xpath=..");

const lineRow = (page: Page, index: number): Locator => page.locator("tbody tr").nth(index);
const chip = (row: Locator, firstName: string): Locator => row.getByRole("button", { name: new RegExp(`\\b${firstName}\\b`) });
const badge = (page: Page, label: string): Locator => page.getByText(label, { exact: true });
/** The app-wide error toast, when it carries this message. */
const toast = (page: Page, text: string): Locator => page.getByRole("status").filter({ hasText: text });

/**
 * The list page, once the browser has taken over. The server's first paint
 * already shows the upload button, so the list request (which only the
 * running page makes) is the signal that a chosen file will be heard.
 */
async function openList(page: Page): Promise<void> {
  await during(page, "GET", /^\/api\/receipts$/, () => page.goto("/organisation/receipts"));
  await expect(page.getByRole("heading", { name: "Receipts" })).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("Loading…")).toHaveCount(0);
}

async function openReceipt(page: Page, id: string): Promise<void> {
  await page.goto(`/organisation/receipts?receipt=${id}`);
  await expect(page.getByLabel("Receipt title")).toBeVisible({ timeout: SLOW });
}

// -------------------------------------------------------------------- suite

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000);
  await person(request, "Ada");
  await person(request, "Bo");
  await person(request, "Cy");
});

test.afterAll(async ({ request }) => {
  test.setTimeout(300_000);
  for (const id of made.settlements) await request.delete(`/api/receipts/settlements?id=${id}`, { timeout: SLOW }).catch(() => undefined);
  for (const id of made.receipts) await request.delete(`/api/receipts/${id}`, { timeout: SLOW }).catch(() => undefined);
  // People last: a participant or settlement row would hold them in place.
  for (const id of made.people.values()) await request.delete(`/api/people/${id}?hard=1`, { timeout: SLOW }).catch(() => undefined);
});

test.beforeEach(() => {
  test.setTimeout(300_000);
});

test("an upload the reader cannot accept is refused with a reason and stores nothing", async ({ request }) => {
  const before = (await json<{ receipts: { id: string }[] }>(await request.get("/api/receipts", { timeout: SLOW }))).receipts.length;

  const none = await request.post("/api/receipts", { multipart: { retailer: TAG }, timeout: SLOW });
  expect(none.status()).toBe(400);

  const heic = await request.post("/api/receipts", { multipart: photos(1, "image/heic", "heic"), timeout: SLOW });
  expect(heic.status()).toBe(415);
  expect((await json<{ error: string }>(heic)).error).toContain("HEIC/HEIF images are not supported yet");

  // An iPhone can hand over a .HEIF with no type at all; the name is enough to refuse it.
  const namedHeif = new FormData();
  namedHeif.append("images", new File([PNG], `${TAG}.HEIF`, { type: "" }));
  const heif = await request.post("/api/receipts", { multipart: namedHeif, timeout: SLOW });
  expect(heif.status()).toBe(415);

  const pdf = await request.post("/api/receipts", { multipart: photos(1, "application/pdf", "pdf"), timeout: SLOW });
  expect(pdf.status()).toBe(415);
  expect((await json<{ error: string }>(pdf)).error).toContain("application/pdf");

  const nine = await request.post("/api/receipts", { multipart: photos(9), timeout: SLOW });
  expect(nine.status()).toBe(400);
  expect((await json<{ error: string }>(nine)).error).toContain("max 8");

  const after = (await json<{ receipts: { id: string }[] }>(await request.get("/api/receipts", { timeout: SLOW }))).receipts.length;
  expect(after, "a refused upload must not leave a receipt behind").toBe(before);
});

test("an iPhone HEIC photo is refused on screen with the instruction to change the camera format", async ({ page }) => {
  await openList(page);
  await expect(page.getByRole("button", { name: "Choose photos" })).toBeEnabled();

  const res = await during(page, "POST", /^\/api\/receipts$/, () =>
    page.locator('input[type="file"]').first().setInputFiles({ name: `${TAG}.heic`, mimeType: "image/heic", buffer: PNG }),
  );
  expect(res.status()).toBe(415);
  await expect(toast(page, "HEIC/HEIF images are not supported yet")).toContainText("Most Compatible");
});

test("a photo uploaded while the reader is off is kept, marked FAILED, and nothing answers 5xx", async ({ page, request }) => {
  const serverErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500 && new URL(r.url()).pathname.startsWith("/api/")) serverErrors.push(`${r.status()} ${r.url()}`);
  });

  await openList(page);
  await expect(page.getByRole("button", { name: "Choose photos" })).toBeEnabled();

  const res = await during(page, "POST", /^\/api\/receipts$/, () =>
    page.locator('input[type="file"]').first().setInputFiles({ name: `${TAG}-grocer.png`, mimeType: "image/png", buffer: PNG }),
  );
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { receipt: { id: string; status: string }; parse: { status: string; review_reason: string } };
  grocerId = body.receipt.id;
  made.receipts.add(grocerId);
  expect(body.parse).toMatchObject({ status: "failed", review_reason: "vision_call_failed", line_count: 0 });

  // The screen opens the new receipt and says plainly what state it is in.
  await expect(page.getByLabel("Receipt title")).toBeVisible();
  await expect(badge(page, "FAILED")).toBeVisible();
  await expect(page.getByText("vision_call_failed")).toBeVisible();
  await expect(page.getByText("No lines parsed.")).toBeVisible();
  await expect(page.getByText("Nobody yet — the whole receipt is yours.")).toBeVisible();

  // The photograph survived the failed read and is served back from the private bucket.
  const photo = page.getByRole("img", { name: "Receipt page 1" });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  const d = await detail(request, grocerId);
  expect(d.images).toHaveLength(1);
  expect(d.images[0].storage_path.startsWith(`${grocerId}/`)).toBe(true);
  expect(serverErrors).toEqual([]);
});

test("a read receipt shows its lines and the mismatch against the printed total, masked until asked", async ({ page }) => {
  enterParsedReceipt(grocerId, { retailer: GROCER, purchased_at: GROCER_DATE, total: GROCER_PRINTED_TOTAL, lines: GROCER_LINES });

  await openReceipt(page, grocerId);
  await expect(badge(page, "NEEDS REVIEW")).toBeVisible();
  await expect(page.getByText("total_mismatch")).toBeVisible();
  await expect(page.getByText(GROCER, { exact: true })).toBeVisible();
  await expect(page.getByText("14 Mar 2031")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);

  // Privacy is on by default: no amount is readable, as text or inside a field.
  await expect(figure(page, "RECEIPT TOTAL")).toContainText("£•••.••");
  await expect(figure(page, "DIFFERENCE")).toContainText("•£•••.••");
  await expect(page.getByLabel("Line total")).toHaveCount(0);
  await expect(page.getByLabel("Unit price")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("31.00");

  await revealMoney(page);
  // Lines 9.00 + 7.50 + 10.00 + 3.50 = 30.00 against a printed 31.00.
  await expect(figure(page, "RECEIPT TOTAL")).toContainText("£31.00");
  await expect(figure(page, "LINES ADD UP TO")).toContainText("£30.00");
  await expect(figure(page, "DIFFERENCE")).toContainText("-£1.00");

  for (const [i, l] of GROCER_LINES.entries()) {
    const row = lineRow(page, i);
    await expect(row.getByLabel("Description")).toHaveValue(l.description);
    await expect(row.getByLabel("Quantity")).toHaveValue(String(l.quantity));
    await expect(row.getByLabel("Line total")).toHaveValue(String(l.line_total));
  }
  await expect(lineRow(page, OIL)).toContainText("E2E001");

  // Back in the list the receipt reads date, retailer, printed total, state.
  await page.getByRole("button", { name: "← All receipts" }).click();
  const listed = page.getByRole("button", { name: new RegExp(GROCER) });
  await expect(listed).toContainText("14 Mar 2031");
  await expect(listed).toContainText("£31.00");
  await expect(listed).toContainText("NEEDS REVIEW");
});

test("correcting a line re-judges the receipt against its printed total", async ({ page, request }) => {
  await openReceipt(page, grocerId);
  await revealMoney(page);

  // Cheddar 10.00 -> 11.00 brings the lines to 31.00, the printed total.
  const cheddar = lineRow(page, CHEDDAR).getByLabel("Line total");
  await cheddar.fill("11");
  const res = await during(page, "PATCH", /\/lines\//, () => cheddar.blur());
  expect(res.status()).toBe(200);

  await expect(badge(page, "PARSED")).toBeVisible();
  await expect(page.getByText("total_mismatch")).toHaveCount(0);
  await expect(figure(page, "LINES ADD UP TO")).toContainText("£31.00");
  await expect(figure(page, "DIFFERENCE")).toContainText("+£0.00");

  const d = await detail(request, grocerId);
  expect(d.receipt).toMatchObject({ status: "parsed", review_reason: null, parsed_total: 31 });
  const bread = d.lines[BREAD];
  const line = (patch: Record<string, unknown>) =>
    request.patch(`/api/receipts/${grocerId}/lines/${bread.id}`, { data: patch, timeout: SLOW });

  // 4p adrift is inside the 5p tolerance; 6p is outside it. (Exactly 5p is
  // deliberately not asserted: lib/receipts/reconcile.test.ts pins that edge.)
  const inside = await json<{ parsed_total: number; status: string; review_reason: string | null }>(await line({ line_total: 3.54 }));
  expect(inside).toMatchObject({ parsed_total: 31.04, status: "parsed", review_reason: null });
  const outside = await json<{ parsed_total: number; status: string; review_reason: string | null }>(await line({ line_total: 3.56 }));
  expect(outside).toMatchObject({ parsed_total: 31.06, status: "needs_review", review_reason: "total_mismatch" });
  const under = await json<{ parsed_total: number; status: string }>(await line({ line_total: 3.44 }));
  expect(under).toMatchObject({ parsed_total: 30.94, status: "needs_review" });

  // Several fields at once; a field the editor does not own is refused.
  const both = await line({ description: `${TAG} Bread, sliced`, quantity: 2, line_total: 3.5 });
  expect(both.status()).toBe(200);
  expect(await json<{ status: string; line: { description: string } }>(both)).toMatchObject({
    status: "parsed",
    line: { description: `${TAG} Bread, sliced` },
  });
  expect((await line({ receipt_id: "00000000-0000-0000-0000-000000000000" })).status()).toBe(400);
  expect((await request.patch(`/api/receipts/${grocerId}/lines/00000000-0000-0000-0000-000000000000`, { data: { quantity: 1 }, timeout: SLOW })).status()).toBe(404);

  // The description cell saves from the screen too.
  await page.reload();
  await expect(page.getByLabel("Receipt title")).toBeVisible({ timeout: SLOW });
  const breadCell = lineRow(page, BREAD).getByLabel("Description");
  await expect(breadCell).toHaveValue(`${TAG} Bread, sliced`);
  await breadCell.fill(`${TAG} Bread`);
  expect((await during(page, "PATCH", /\/lines\//, () => breadCell.blur())).status()).toBe(200);
  expect((await detail(request, grocerId)).lines[BREAD].description).toBe(`${TAG} Bread`);
});

test("the title is typed in place, names the receipt in the list, and falls back to the retailer when cleared", async ({ page, request }) => {
  const title = `${TAG} Big shop`;
  await openReceipt(page, grocerId);
  const field = page.getByLabel("Receipt title");

  await field.fill(title);
  expect((await during(page, "PATCH", new RegExp(`/api/receipts/${grocerId}$`), () => field.press("Enter"))).status()).toBe(200);
  expect((await detail(request, grocerId)).receipt.title).toBe(title);

  // The list names it by its title, and reopened the field holds it.
  await page.getByRole("button", { name: "← All receipts" }).click();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Select ${title}` })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(field).toHaveValue(title);

  // Escape abandons a half-typed change: nothing is sent and the field goes back.
  const patches: string[] = [];
  const watch = (r: { method(): string; url(): string }) => {
    if (r.method() === "PATCH") patches.push(r.url());
  };
  page.on("request", watch);
  await field.fill(`${title} scrap`);
  await field.press("Escape");
  await expect(field).toHaveValue(title);
  await page.evaluate(() => 0);
  expect(patches, "Escape must not save the abandoned text").toEqual([]);
  expect((await detail(request, grocerId)).receipt.title).toBe(title);
  page.off("request", watch);

  // Cleared, the list names it by retailer again.
  await field.fill("");
  expect((await during(page, "PATCH", new RegExp(`/api/receipts/${grocerId}$`), () => field.press("Enter"))).status()).toBe(200);
  expect((await detail(request, grocerId)).receipt.title).toBeNull();
  await page.getByRole("button", { name: "← All receipts" }).click();
  await expect(page.getByRole("button", { name: new RegExp(GROCER) })).toBeVisible();

  // Receipt-level fields the API owns; anything else is refused; an unknown id is not found.
  expect((await request.patch(`/api/receipts/${grocerId}`, { data: { status: "parsed" }, timeout: SLOW })).status()).toBe(400);
  expect((await request.patch("/api/receipts/00000000-0000-0000-0000-000000000000", { data: { title: "x" }, timeout: SLOW })).status()).toBe(404);
  // A total that is not a number, or a date that is not one, is the caller's mistake (400), never a 5xx.
  for (const bad of [{ total: "lots" }, { total: "" }, { purchased_at: "14/03/2031" }, { purchased_at: "2031-02-31" }]) {
    expect((await request.patch(`/api/receipts/${grocerId}`, { data: bad, timeout: SLOW })).status(), JSON.stringify(bad)).toBe(400);
  }
  const kept = await request.patch(`/api/receipts/${grocerId}`, { data: { title, purchased_at: GROCER_DATE }, timeout: SLOW });
  expect(kept.status()).toBe(200);
  expect((await json<{ receipt: Detail["receipt"] }>(kept)).receipt).toMatchObject({ title, purchased_at: GROCER_DATE, total: 31, status: "parsed" });
});

test("people are added to a receipt by searching for them", async ({ page, request }) => {
  await openReceipt(page, grocerId);
  const search = page.getByLabel("Add a person to this receipt");

  for (const name of [ADA, BO]) {
    await search.fill(name);
    const option = page.getByRole("button", { name: new RegExp(`^${name}`) });
    const res = await during(page, "POST", /\/participants$/, () => option.click());
    expect(res.status()).toBe(201);
    await expect(page.getByRole("button", { name: `Remove ${name} from this receipt` })).toBeVisible();
  }
  await expect(page.getByText("Nobody yet — the whole receipt is yours.")).toHaveCount(0);

  // Someone already on the receipt is not offered again.
  await search.fill(ADA);
  await expect(page.getByRole("button", { name: new RegExp(`^${ADA}`) })).toHaveCount(0);
  await search.fill("");

  // Nobody is tagged yet, so every line is still the owner's and nobody owes anything on it.
  await revealMoney(page);
  const footer = figure(page, "THIS RECEIPT");
  await expect(figure(footer, ADA.toUpperCase())).toContainText("£0.00");
  await expect(figure(footer, "YOURS")).toContainText("£31.00");

  const add = (data: Record<string, unknown>) => request.post(`/api/receipts/${grocerId}/participants`, { data, timeout: SLOW });
  expect((await add({})).status()).toBe(400);
  expect((await add({ person_id: "00000000-0000-0000-0000-000000000000" })).status()).toBe(404);
  expect((await add({ person_id: personId(CY), default_share_pct: 0 })).status()).toBe(400);
  expect((await add({ person_id: personId(CY), default_share_pct: 101 })).status()).toBe(400);
  expect((await detail(request, grocerId)).participants.map((p) => p.display_name).sort()).toEqual([ADA, BO]);
});

test("tagging splits a line evenly, an exact share is set from the chip, and the footer adds up", async ({ page, request }) => {
  await openReceipt(page, grocerId);
  await revealMoney(page);
  const tag = /\/tag$/;

  // Cheddar £11.00. Ada alone takes the whole line; with Bo it is 50/50.
  const cheddar = lineRow(page, CHEDDAR);
  expect((await during(page, "POST", tag, () => chip(cheddar, "Ada").click())).status()).toBe(200);
  await expect(chip(cheddar, "Ada")).toContainText("100%");
  await expect(chip(cheddar, "Ada")).toContainText("£11.00");
  await expect(figure(cheddar, "YOURS")).toContainText("£0.00");
  expect((await during(page, "POST", tag, () => chip(cheddar, "Bo").click())).status()).toBe(200);
  await expect(chip(cheddar, "Ada")).toContainText("50%");
  await expect(chip(cheddar, "Ada")).toContainText("£5.50");
  await expect(chip(cheddar, "Bo")).toContainText("£5.50");
  await expect(figure(cheddar, "YOURS")).toContainText("£0.00");

  // Olive oil £9.00. Ada is given exactly a quarter: £2.25, leaving £6.75.
  const oil = lineRow(page, OIL);
  await chip(oil, "Ada").click({ button: "right" });
  await page.getByLabel("Percentage of the line").fill("25");
  expect((await during(page, "PUT", /\/shares$/, () => page.getByRole("button", { name: "Set", exact: true }).click())).status()).toBe(200);
  await expect(chip(oil, "Ada")).toContainText("25%");
  await expect(chip(oil, "Ada")).toContainText("£2.25");
  await expect(figure(oil, "YOURS")).toContainText("£6.75");

  // A share that would claim more than the line is refused and says why. 25% + 80% = 105%.
  await chip(oil, "Bo").click({ button: "right" });
  await page.getByLabel("Percentage of the line").fill("80");
  expect((await during(page, "PUT", /\/shares$/, () => page.getByLabel("Percentage of the line").press("Enter"))).status()).toBe(400);
  await expect(toast(page, "shares add up to 105% of the line")).toBeVisible();
  await expect(chip(oil, "Bo")).not.toContainText("%");

  // Sparkling water, 3 for £7.50. Bo took two bottles: 7.50 / 3 x 2 = £5.00.
  const water = lineRow(page, WATER);
  await chip(water, "Bo").click({ button: "right" });
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByLabel("Number of units").fill("2");
  expect((await during(page, "PUT", /\/shares$/, () => page.getByRole("button", { name: "Set", exact: true }).click())).status()).toBe(200);
  await expect(chip(water, "Bo")).toContainText("2u");
  await expect(chip(water, "Bo")).toContainText("£5.00");
  await expect(figure(water, "YOURS")).toContainText("£2.50");
  // Tagging Ada leaves Bo's two bottles alone and gives her what is left of
  // the line: 100 - 66.67 = 33.33%, which is £2.50.
  expect((await during(page, "POST", tag, () => chip(water, "Ada").click())).status()).toBe(200);
  await expect(chip(water, "Bo")).toContainText("2u");
  await expect(chip(water, "Bo")).toContainText("£5.00");
  await expect(chip(water, "Ada")).toContainText("33.33%");
  await expect(chip(water, "Ada")).toContainText("£2.50");
  await expect(figure(water, "YOURS")).toContainText("£0.00");

  // Bread £3.50 is nobody's but the owner's, so it carries no YOURS chip at all.
  await expect(lineRow(page, BREAD).getByText("YOURS", { exact: true })).toHaveCount(0);

  // Ada 5.50 + 2.25 + 2.50 = 10.25. Bo 5.50 + 5.00 = 10.50.
  // The owner 0 + 6.75 + 0 + 3.50 = 10.25. Together £31.00, the receipt.
  const footer = figure(page, "THIS RECEIPT");
  await expect(figure(footer, ADA.toUpperCase())).toContainText("£10.25");
  await expect(figure(footer, BO.toUpperCase())).toContainText("£10.50");
  await expect(figure(footer, "YOURS")).toContainText("£10.25");

  // And what the screen shows is what is stored.
  const d = await detail(request, grocerId);
  const stored = (line: number, name: string) =>
    d.shares.find((s) => s.receipt_line_id === d.lines[line].id && s.person_id === personId(name));
  expect(stored(CHEDDAR, ADA)).toMatchObject({ share_pct: 50, units: null });
  expect(stored(CHEDDAR, BO)).toMatchObject({ share_pct: 50, units: null });
  expect(stored(OIL, ADA)).toMatchObject({ share_pct: 25, units: null });
  expect(stored(OIL, BO)).toBeUndefined();
  expect(stored(WATER, BO)).toMatchObject({ share_pct: null, units: 2 });
  expect(stored(WATER, ADA)).toMatchObject({ share_pct: 33.33, units: null });
  expect(d.shares).toHaveLength(5);

  // A second click on a tagged chip takes the person off the line again.
  expect((await during(page, "DELETE", tag, () => chip(cheddar, "Bo").click())).status()).toBe(200);
  await expect(chip(cheddar, "Ada")).toContainText("100%");
  await expect(chip(cheddar, "Bo")).not.toContainText("%");
  expect((await during(page, "POST", tag, () => chip(cheddar, "Bo").click())).status()).toBe(200);
  await expect(chip(cheddar, "Bo")).toContainText("£5.50");
});

test("the share rules hold: defaults, even division, units, and no line claimed for more than it is worth", async ({ request }) => {
  bakeryId = await uploadByApi(request);
  enterParsedReceipt(bakeryId, { retailer: BAKERY, purchased_at: "2031-03-15", total: 6, lines: BAKERY_LINES });
  const d = await detail(request, bakeryId);
  expect(d.receipt).toMatchObject({ status: "parsed", parsed_total: 6, total: 6 });
  const [loaf, buns] = d.lines;
  const ada = personId(ADA);
  const bo = personId(BO);
  const cy = personId(CY);

  const join = (person_id: string, default_share_pct?: number | null) =>
    request.post(`/api/receipts/${bakeryId}/participants`, { data: { person_id, default_share_pct }, timeout: SLOW });
  const tag = (lineId: string, person_id: string) =>
    request.post(`/api/receipts/${bakeryId}/lines/${lineId}/tag`, { data: { person_id }, timeout: SLOW });
  const untag = (lineId: string, person_id: string) =>
    request.delete(`/api/receipts/${bakeryId}/lines/${lineId}/tag?person_id=${person_id}`, { timeout: SLOW });
  const put = (lineId: string, shares: Share[]) =>
    request.put(`/api/receipts/${bakeryId}/lines/${lineId}/shares`, { data: { shares }, timeout: SLOW });

  // Tagging someone who is not on the receipt is refused.
  expect((await tag(loaf.id, ada)).status()).toBe(400);

  expect((await join(ada)).status()).toBe(201);
  expect((await join(bo)).status()).toBe(201);
  expect((await join(cy, 20)).status()).toBe(201);

  // Loaf £3.50. Cy carries a 20% default: 70p, and the owner keeps £2.80.
  expect((await tag(loaf.id, cy)).status()).toBe(200);
  let s = await sharesOn(request, bakeryId, loaf.id);
  expect(s.byPerson.get(cy)).toMatchObject({ share_pct: 20, amount: 0.7 });
  expect(s.owner).toBe(2.8);

  // Ada has no default, so she takes what Cy's 20% leaves: 80%, £2.80.
  expect((await tag(loaf.id, ada)).status()).toBe(200);
  s = await sharesOn(request, bakeryId, loaf.id);
  expect(s.byPerson.get(ada)).toMatchObject({ share_pct: 80, amount: 2.8 });
  expect(s.byPerson.get(cy)).toMatchObject({ share_pct: 20, amount: 0.7 });
  expect(s.owner).toBe(0);

  // Bo joins: the 80% divides between the two without a default, 40% each, £1.40.
  expect((await tag(loaf.id, bo)).status()).toBe(200);
  s = await sharesOn(request, bakeryId, loaf.id);
  expect(s.byPerson.get(ada)).toMatchObject({ share_pct: 40, amount: 1.4 });
  expect(s.byPerson.get(bo)).toMatchObject({ share_pct: 40, amount: 1.4 });
  expect(s.byPerson.get(cy)).toMatchObject({ share_pct: 20, amount: 0.7 });
  expect(s.owner).toBe(0);

  // Tagging twice changes nothing.
  expect((await tag(loaf.id, bo)).status()).toBe(200);
  expect((await sharesOn(request, bakeryId, loaf.id)).count).toBe(3);

  // Cy comes off: the two left hold the line 50/50, £1.75 each.
  expect((await untag(loaf.id, cy)).status()).toBe(200);
  s = await sharesOn(request, bakeryId, loaf.id);
  expect(s.count).toBe(2);
  expect(s.byPerson.get(ada)).toMatchObject({ share_pct: 50, amount: 1.75 });
  expect(s.byPerson.get(bo)).toMatchObject({ share_pct: 50, amount: 1.75 });

  // Adding Cy again without a default clears it; three even shares are 33.33% each,
  // and a third of £3.50 to the penny is £1.17.
  expect((await join(cy, null)).status()).toBe(201);
  expect((await tag(loaf.id, cy)).status()).toBe(200);
  s = await sharesOn(request, bakeryId, loaf.id);
  for (const p of [ada, bo, cy]) expect(s.byPerson.get(p)).toMatchObject({ share_pct: 33.33, amount: 1.17 });
  expect(s.owner).toBe(0);

  // Buns, 6 for £2.50. Ada two (2.50 / 6 x 2 = 83p), Bo three (£1.25), owner the last one (42p).
  expect((await put(buns.id, [{ person_id: ada, share_pct: null, units: 2 }, { person_id: bo, share_pct: null, units: 3 }])).status()).toBe(200);
  s = await sharesOn(request, bakeryId, buns.id);
  expect(s.byPerson.get(ada)).toMatchObject({ units: 2, amount: 0.83 });
  expect(s.byPerson.get(bo)).toMatchObject({ units: 3, amount: 1.25 });
  expect(s.owner).toBe(0.42);

  // Nothing below may be stored, and none of it disturbs what is.
  const refused: [string, Share[], string][] = [
    ["seven units of six", [{ person_id: ada, share_pct: null, units: 4 }, { person_id: bo, share_pct: null, units: 3 }], "shares claim 7 units of a line that has 6"],
    ["110% of the line", [{ person_id: ada, share_pct: 60, units: null }, { person_id: bo, share_pct: 50, units: null }], "shares add up to 110% of the line"],
    ["both measures on one share", [{ person_id: ada, share_pct: 10, units: 1 }], "exactly one of share_pct or units"],
    ["neither measure", [{ person_id: ada, share_pct: null, units: null }], "exactly one of share_pct or units"],
    ["one person twice", [{ person_id: ada, share_pct: 10, units: null }, { person_id: ada, share_pct: 20, units: null }], "only one share per line"],
    ["a negative share", [{ person_id: ada, share_pct: -5, units: null }], "share_pct must be above 0"],
  ];
  for (const [what, shares, message] of refused) {
    const res = await put(buns.id, shares);
    expect(res.status(), what).toBe(400);
    expect((await json<{ error: string }>(res)).error, what).toContain(message);
  }
  expect((await request.put(`/api/receipts/${bakeryId}/lines/${buns.id}/shares`, { data: { shares: "all" }, timeout: SLOW })).status()).toBe(400);
  s = await sharesOn(request, bakeryId, buns.id);
  expect(s.byPerson.get(ada)).toMatchObject({ units: 2, amount: 0.83 });
  expect(s.byPerson.get(bo)).toMatchObject({ units: 3, amount: 1.25 });

  // A line from another receipt cannot be reached through this one's address.
  const grocerLine = (await detail(request, grocerId)).lines[BREAD];
  expect((await put(grocerLine.id, [])).status()).toBe(404);
  expect((await tag(grocerLine.id, ada)).status()).toBe(404);

  // An empty set hands the whole line back to the owner.
  expect((await put(buns.id, [])).status()).toBe(200);
  s = await sharesOn(request, bakeryId, buns.id);
  expect(s.count).toBe(0);
  expect(s.owner).toBe(2.5);

  // Taking everyone off the receipt takes their shares with them.
  for (const p of [ada, bo, cy]) {
    expect((await request.delete(`/api/receipts/${bakeryId}/participants?person_id=${p}`, { timeout: SLOW })).status()).toBe(200);
  }
  const emptied = await detail(request, bakeryId);
  expect(emptied.participants).toEqual([]);
  expect(emptied.shares).toEqual([]);
  // A share for someone no longer on the receipt is refused.
  expect((await put(loaf.id, [{ person_id: ada, share_pct: 50, units: null }])).status()).toBe(400);
});

test("balances show what each person owes, take payments, and follow a corrected line", async ({ page, request }) => {
  const ada = personId(ADA);
  const bo = personId(BO);

  // Owed comes from the shares alone: Ada £10.25 and Bo £10.50, all on the grocer receipt.
  let all = await balances(request);
  expect(all.find((b) => b.person_id === ada)).toMatchObject({ owed: 10.25, paid: 0, outstanding: 10.25, display_name: ADA });
  expect(all.find((b) => b.person_id === bo)).toMatchObject({ owed: 10.5, paid: 0, outstanding: 10.5 });
  expect(all.find((b) => b.person_id === ada)!.receipts).toEqual([expect.objectContaining({ receipt_id: grocerId, owed: 10.25 })]);
  expect(all.find((b) => b.person_id === personId(CY))).toBeUndefined();

  await page.goto("/organisation/receipts/balances");
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible({ timeout: SLOW });
  const card = (name: string) => page.getByTestId("balance-card").filter({ hasText: name });
  await expect(card(ADA)).toBeVisible();

  // Masked until asked, like the rest of finance.
  await expect(figure(card(ADA), "OWED")).toContainText("£•••.••");
  await expect(page.locator("body")).not.toContainText("10.25");
  await revealMoney(page);

  await expect(figure(card(ADA), "OWED")).toContainText("£10.25");
  await expect(figure(card(ADA), "PAID")).toContainText("£0.00");
  await expect(figure(card(ADA), "OUTSTANDING")).toContainText("£10.25");
  await expect(figure(card(BO), "OUTSTANDING")).toContainText("£10.50");

  // The headline is every card's outstanding added together.
  const totalPence = all.reduce((s, b) => s + pence(b.outstanding), 0);
  await expect(figure(page, "TOTAL OUTSTANDING")).toContainText(`£${(totalPence / 100).toFixed(2)}`);

  // Whoever owes most is listed first.
  const names = await page.getByTestId("balance-card").allTextContents();
  expect(names.findIndex((t) => t.includes(BO))).toBeLessThan(names.findIndex((t) => t.includes(ADA)));

  // Ada pays £4.25: 10.25 - 4.25 leaves £6.00.
  const pay = async (amount: string, note: string) => {
    await card(ADA).getByRole("button", { name: "Record payment" }).click();
    await card(ADA).getByLabel("AMOUNT").fill(amount);
    await card(ADA).getByLabel("NOTE").fill(note);
    const res = await during(page, "POST", /\/settlements$/, () => card(ADA).getByRole("button", { name: "Save" }).click());
    expect(res.status()).toBe(201);
    made.settlements.add(((await res.json()) as { settlement: { id: string } }).settlement.id);
  };
  await pay("4.25", `${TAG} part`);
  await expect(figure(card(ADA), "PAID")).toContainText("£4.25");
  await expect(figure(card(ADA), "OUTSTANDING")).toContainText("£6.00");
  await expect(card(ADA).getByRole("button", { name: "Save" })).toHaveCount(0);

  // A second £10.00 is £4.00 too much, and is shown as owed back rather than hidden.
  await pay("10", `${TAG} rest`);
  await expect(figure(card(ADA), "PAID")).toContainText("£14.25");
  await expect(figure(card(ADA), "OVERPAID")).toContainText("£4.00");
  await expect(card(ADA).getByText("OUTSTANDING", { exact: true })).toHaveCount(0);

  all = await balances(request);
  expect(all.find((b) => b.person_id === ada)).toMatchObject({ owed: 10.25, paid: 14.25, outstanding: -4 });

  // An empty amount is caught on the screen and nothing is sent.
  await card(BO).getByRole("button", { name: "Record payment" }).click();
  await card(BO).getByRole("button", { name: "Save" }).click();
  await expect(toast(page, "Enter an amount")).toBeVisible();
  await card(BO).getByRole("button", { name: "Cancel" }).click();

  // The payments list, newest first, and what the API refuses.
  const listed = await json<{ settlements: { id: string; amount: number; note: string | null }[] }>(
    await request.get(`/api/receipts/settlements?person_id=${ada}`, { timeout: SLOW }),
  );
  expect(listed.settlements.map((x) => x.amount).sort()).toEqual([10, 4.25].sort());
  expect(new Set(listed.settlements.map((x) => x.id))).toEqual(made.settlements);
  const settle = (data: Record<string, unknown>) => request.post("/api/receipts/settlements", { data, timeout: SLOW });
  expect((await settle({ amount: 5 })).status()).toBe(400);
  expect((await settle({ person_id: ada, amount: 0 })).status()).toBe(400);
  expect((await settle({ person_id: ada, amount: "lots" })).status()).toBe(400);
  expect((await settle({ person_id: ada, amount: 5, paid_at: "14/03/2031" })).status()).toBe(400);
  expect((await settle({ person_id: "00000000-0000-0000-0000-000000000000", amount: 5 })).status()).toBe(404);
  expect((await balances(request)).find((b) => b.person_id === ada)).toMatchObject({ paid: 14.25 });

  // A corrected line moves the balance with it: olive oil 9.00 -> 13.00 makes
  // Ada's quarter £3.25 instead of £2.25, so she owes £11.25. Put back, £10.25.
  const oil = (await detail(request, grocerId)).lines[OIL];
  const setOil = (line_total: number) =>
    request.patch(`/api/receipts/${grocerId}/lines/${oil.id}`, { data: { line_total }, timeout: SLOW });
  expect((await setOil(13)).status()).toBe(200);
  expect((await balances(request)).find((b) => b.person_id === ada)).toMatchObject({ owed: 11.25, outstanding: -3 });
  expect((await setOil(9)).status()).toBe(200);
  expect((await balances(request)).find((b) => b.person_id === ada)).toMatchObject({ owed: 10.25, outstanding: -4 });

  // Her one receipt is listed under the card and opens the receipt itself.
  await card(ADA).getByRole("button", { name: "1 receipt", exact: true }).click();
  const link = card(ADA).getByRole("link", { name: new RegExp(`${TAG} Big shop`) });
  await expect(link).toContainText("14 Mar 2031");
  await expect(link).toContainText("£10.25");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/organisation/receipts\\?receipt=${grocerId}$`));
  await expect(page.getByLabel("Receipt title")).toHaveValue(`${TAG} Big shop`, { timeout: SLOW });
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("taking someone off a receipt removes their shares and re-divides only the lines they were on", async ({ page, request }) => {
  await openReceipt(page, grocerId);
  await revealMoney(page);

  const res = await during(page, "DELETE", /\/participants$/, () =>
    page.getByRole("button", { name: `Remove ${BO} from this receipt` }).click(),
  );
  expect(res.status()).toBe(200);
  await expect(page.getByRole("button", { name: `Remove ${BO} from this receipt` })).toHaveCount(0);

  // Cheddar was 50/50 with Bo: Ada now holds all £11.00 of it.
  await expect(chip(lineRow(page, CHEDDAR), "Ada")).toContainText("100%");
  await expect(chip(lineRow(page, CHEDDAR), "Ada")).toContainText("£11.00");
  // The water: Bo's two bottles are gone, so Ada's slice is no longer squeezed by them.
  await expect(chip(lineRow(page, WATER), "Ada")).toContainText("100%");
  await expect(chip(lineRow(page, WATER), "Ada")).toContainText("£7.50");
  // Olive oil never had Bo on it. Ada's hand-set quarter stays exactly as it was typed.
  await expect(chip(lineRow(page, OIL), "Ada")).toContainText("25%");
  await expect(chip(lineRow(page, OIL), "Ada")).toContainText("£2.25");
  await expect(figure(lineRow(page, OIL), "YOURS")).toContainText("£6.75");

  // Ada 11.00 + 7.50 + 2.25 = 20.75. The owner 6.75 + 3.50 = 10.25.
  const footer = figure(page, "THIS RECEIPT");
  await expect(figure(footer, ADA.toUpperCase())).toContainText("£20.75");
  await expect(figure(footer, "YOURS")).toContainText("£10.25");
  await expect(footer).not.toContainText(BO.toUpperCase());

  const d = await detail(request, grocerId);
  expect(d.participants.map((p) => p.display_name)).toEqual([ADA]);
  expect(d.shares.filter((s) => s.person_id === personId(BO))).toEqual([]);
  const all = await balances(request);
  expect(all.find((b) => b.person_id === personId(BO)), "Bo owes nothing and has paid nothing, so has no balance").toBeUndefined();
  expect(all.find((b) => b.person_id === personId(ADA))).toMatchObject({ owed: 20.75, paid: 14.25, outstanding: 6.5 });
});

test("reparse and add-photos with the reader off fail in the open and lose nothing", async ({ page, request }) => {
  const serverErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500 && new URL(r.url()).pathname.startsWith("/api/")) serverErrors.push(`${r.status()} ${r.url()}`);
  });
  await openReceipt(page, grocerId);
  await expect(badge(page, "PARSED")).toBeVisible();

  const reparse = await during(page, "POST", /\/reparse$/, () => page.getByRole("button", { name: "Reparse" }).click());
  expect(reparse.status()).toBe(200);
  expect(((await reparse.json()) as { parse: { status: string; review_reason: string } }).parse).toMatchObject({
    status: "failed",
    review_reason: "vision_call_failed",
  });
  await expect(badge(page, "FAILED")).toBeVisible();
  await expect(page.getByText("vision_call_failed")).toBeVisible();
  // The lines and the split read before the failure are still there.
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(chip(lineRow(page, CHEDDAR), "Ada")).toContainText("100%");

  // A second page is appended, kept, and shown, even though it could not be read.
  const added = await during(page, "POST", /\/images$/, () =>
    page.locator('input[type="file"]').nth(1).setInputFiles({ name: `${TAG}-page2.png`, mimeType: "image/png", buffer: PNG }),
  );
  expect(added.status()).toBe(201);
  expect(((await added.json()) as { added: number }).added).toBe(1);
  await expect(page.getByRole("img", { name: "Receipt page 2" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  expect(serverErrors).toEqual([]);

  const d = await detail(request, grocerId);
  expect(d.images.map((i) => i.sort_order)).toEqual([0, 1]);
  expect(d.lines).toHaveLength(4);
  expect(d.shares).toHaveLength(3);
  expect(d.receipt).toMatchObject({ status: "failed", review_reason: "vision_call_failed", total: 31, parsed_total: 31 });

  // Eight pages is the ceiling for the receipt, not for one upload: 2 + 7 is refused, 2 stay.
  const tooMany = await request.post(`/api/receipts/${grocerId}/images`, { multipart: photos(7), timeout: SLOW });
  expect(tooMany.status()).toBe(400);
  expect((await json<{ error: string }>(tooMany)).error).toContain("receipt already has 2, adding 7 would make 9");
  expect((await request.post(`/api/receipts/${grocerId}/images`, { multipart: photos(1, "image/heic", "heic"), timeout: SLOW })).status()).toBe(415);
  expect((await detail(request, grocerId)).images).toHaveLength(2);

  expect((await request.post("/api/receipts/00000000-0000-0000-0000-000000000000/reparse", { timeout: SLOW })).status()).toBe(404);
  expect((await request.post("/api/receipts/00000000-0000-0000-0000-000000000000/images", { multipart: photos(1), timeout: SLOW })).status()).toBe(404);

  // A failed receipt keeps its recorded failure: a line edit still saves and
  // still moves the sum, but does not relabel the receipt.
  const bread = d.lines[BREAD];
  const edited = await request.patch(`/api/receipts/${grocerId}/lines/${bread.id}`, { data: { line_total: 4 }, timeout: SLOW });
  expect(await json<{ parsed_total: number; status: string; review_reason: string }>(edited)).toMatchObject({
    parsed_total: 31.5,
    status: "failed",
    review_reason: "vision_call_failed",
  });
  expect((await request.patch(`/api/receipts/${grocerId}/lines/${bread.id}`, { data: { line_total: 3.5 }, timeout: SLOW })).status()).toBe(200);
});

test("two uploads of one receipt are merged from the list into the earlier one", async ({ page, request }) => {
  const first = await uploadByApi(request);
  const second = await uploadByApi(request, 2);
  const firstTitle = `${TAG} merge one`;
  const secondTitle = `${TAG} merge two`;
  enterParsedReceipt(first, { retailer: `${TAG} Market`, purchased_at: "2031-03-16", total: 6, lines: BAKERY_LINES });
  expect((await request.patch(`/api/receipts/${first}`, { data: { title: firstTitle }, timeout: SLOW })).status()).toBe(200);
  expect((await request.patch(`/api/receipts/${second}`, { data: { title: secondTitle }, timeout: SLOW })).status()).toBe(200);

  // What the merge refuses: fewer than two, and any receipt it cannot find (nothing is touched).
  const merge = (ids: unknown) => request.post("/api/receipts/merge", { data: { ids }, timeout: SLOW });
  expect((await merge([first])).status()).toBe(400);
  expect((await merge([first, first])).status()).toBe(400);
  expect((await merge("both")).status()).toBe(400);
  expect((await merge([first, "00000000-0000-0000-0000-000000000000"])).status()).toBe(404);
  expect((await detail(request, first)).images).toHaveLength(1);
  expect((await detail(request, second)).images).toHaveLength(2);

  await openList(page);
  await expect(page.getByRole("checkbox", { name: `Select ${firstTitle}` })).toBeVisible();
  await page.getByRole("checkbox", { name: `Select ${firstTitle}` }).check();
  await expect(page.getByText("1 SELECTED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: `Select ${secondTitle}` }).check();
  await expect(page.getByText("2 SELECTED")).toBeVisible();

  let asked = "";
  page.once("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.accept();
  });
  const res = await during(page, "POST", /\/api\/receipts\/merge$/, () => page.getByRole("button", { name: "Merge", exact: true }).click());
  expect(res.status()).toBe(200);
  expect(asked).toContain("Merge 2 receipts into one?");
  expect(asked).toContain("3 images will be combined onto the earliest receipt");
  expect(asked).toContain("The other 1 receipt will be deleted");
  expect((await res.json()) as { merged: number; images: number; receipt: { id: string } }).toMatchObject({
    merged: 1,
    images: 3,
    receipt: { id: first },
  });

  // The survivor opens, holding all three pages in one sequence.
  await expect(page.getByLabel("Receipt title")).toHaveValue(firstTitle);
  for (const n of [1, 2, 3]) await expect(page.getByRole("img", { name: `Receipt page ${n}` })).toBeVisible();
  // The re-read could not happen, which is said, and the lines it had are kept.
  await expect(badge(page, "FAILED")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  const kept = await detail(request, first);
  expect(kept.images.map((i) => i.sort_order)).toEqual([0, 1, 2]);
  expect(kept.lines).toHaveLength(2);
  expect((await request.get(`/api/receipts/${second}`, { timeout: SLOW })).status()).toBe(404);
  made.receipts.delete(second);

  await page.getByRole("button", { name: "← All receipts" }).click();
  await expect(page.getByRole("checkbox", { name: `Select ${firstTitle}` })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Select ${secondTitle}` })).toHaveCount(0);
  await expect(page.getByText(/SELECTED/)).toHaveCount(0);
});

test("correcting the printed total re-judges the receipt, which is the only way out of no_total", async ({ request }) => {
  const id = await uploadByApi(request);
  // No printed total was readable; the lines add up to 6.00.
  enterParsedReceipt(id, { retailer: `${TAG} Kiosk`, purchased_at: "2031-03-17", total: null, lines: BAKERY_LINES });
  expect((await detail(request, id)).receipt).toMatchObject({ status: "needs_review", review_reason: "no_total", parsed_total: 6 });

  // A line edit cannot resolve a missing total, by rule.
  const line = (await detail(request, id)).lines[0];
  const edited = await request.patch(`/api/receipts/${id}/lines/${line.id}`, { data: { quantity: 1 }, timeout: SLOW });
  expect(await json<{ status: string; review_reason: string }>(edited)).toMatchObject({ status: "needs_review", review_reason: "no_total" });

  const setTotal = async (total: number | null) => {
    const res = await request.patch(`/api/receipts/${id}`, { data: { total }, timeout: SLOW });
    expect(res.status(), await res.text()).toBe(200);
    return (await json<{ receipt: Detail["receipt"] }>(res)).receipt;
  };
  expect(await setTotal(6)).toMatchObject({ total: 6, status: "parsed", review_reason: null });
  expect(await setTotal(7)).toMatchObject({ total: 7, status: "needs_review", review_reason: "total_mismatch" });
  expect(await setTotal(6.04)).toMatchObject({ total: 6.04, status: "parsed", review_reason: null });
  expect(await setTotal(null)).toMatchObject({ total: null, status: "needs_review", review_reason: "no_total" });

  // A change that is not the total leaves the judgement where it was.
  expect(await setTotal(6)).toMatchObject({ status: "parsed" });
  const renamed = await request.patch(`/api/receipts/${id}`, { data: { retailer: `${TAG} Kiosk 2` }, timeout: SLOW });
  expect((await json<{ receipt: Detail["receipt"] }>(renamed)).receipt).toMatchObject({ retailer: `${TAG} Kiosk 2`, status: "parsed", review_reason: null });

  // A failed read keeps its recorded failure whatever total is typed.
  expect((await request.post(`/api/receipts/${id}/reparse`, { timeout: SLOW })).status()).toBe(200);
  expect(await setTotal(7)).toMatchObject({ total: 7, status: "failed", review_reason: "vision_call_failed" });

  expect((await request.delete(`/api/receipts/${id}`, { timeout: SLOW })).status()).toBe(200);
  made.receipts.delete(id);
});

test("the list filters by status, retailer and date", async ({ request }) => {
  const ids = async (query: string) =>
    (await json<{ receipts: { id: string; image_count: number }[] }>(await request.get(`/api/receipts?${query}`, { timeout: SLOW }))).receipts.map((r) => r.id);

  expect(await ids(`retailer=${encodeURIComponent(GROCER)}`)).toEqual([grocerId]);
  expect(await ids(`retailer=${encodeURIComponent(TAG)}&status=parsed`)).toEqual([bakeryId]);
  expect(await ids(`retailer=${encodeURIComponent(TAG)}&status=failed`)).toContain(grocerId);
  expect(await ids(`retailer=${encodeURIComponent(TAG)}&from=2031-03-15&to=2031-03-15`)).toEqual([bakeryId]);
  // Newest purchase first.
  const dated = await ids(`retailer=${encodeURIComponent(TAG)}&from=2031-03-14&to=2031-03-15`);
  expect(dated).toEqual([bakeryId, grocerId]);

  const listed = await json<{ receipts: { id: string; image_count: number }[] }>(
    await request.get(`/api/receipts?retailer=${encodeURIComponent(GROCER)}`, { timeout: SLOW }),
  );
  expect(listed.receipts[0].image_count).toBe(2);
});

test("deleting a receipt takes its lines, split and photographs with it, and leaves payments standing", async ({ page, request }) => {
  const before = await detail(request, grocerId);
  expect(before.images).toHaveLength(2);
  const stored = () => Number(localSql(`select count(*) from storage.objects where bucket_id = 'receipts' and name like '${grocerId}/%'`)[0][0]);
  expect(stored()).toBe(2);

  expect((await request.delete(`/api/receipts/${grocerId}`, { timeout: SLOW })).status()).toBe(200);
  expect((await request.get(`/api/receipts/${grocerId}`, { timeout: SLOW })).status()).toBe(404);
  made.receipts.delete(grocerId);

  const lineIds = before.lines.map((l) => `'${l.id}'`).join(", ");
  const left = localSql(
    `select (select count(*) from public.receipt_lines where receipt_id = '${grocerId}'), ` +
      `(select count(*) from public.receipt_images where receipt_id = '${grocerId}'), ` +
      `(select count(*) from public.receipt_participants where receipt_id = '${grocerId}'), ` +
      `(select count(*) from public.receipt_line_shares where receipt_line_id in (${lineIds}))`,
  )[0];
  expect(left, "lines, images, participants, shares").toEqual(["0", "0", "0", "0"]);
  await expect.poll(stored, { timeout: 30_000 }).toBe(0);

  // Deleting something that is not there is "not found", not a silent success.
  expect((await request.delete(`/api/receipts/${grocerId}`, { timeout: SLOW })).status()).toBe(404);

  // An old link to it says so and offers the way back, rather than loading for ever.
  await page.goto(`/organisation/receipts?receipt=${grocerId}`);
  await expect(page.getByText("This receipt could not be found.")).toBeVisible({ timeout: SLOW });
  await page.getByRole("button", { name: "← All receipts" }).click();
  await expect(page.getByText("This receipt could not be found.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(BAKERY) })).toBeVisible();

  // Ada's payments were against her, not the receipt: she now owes nothing and
  // is still listed, £14.25 in credit.
  const ada = (await balances(request)).find((b) => b.person_id === personId(ADA));
  expect(ada).toMatchObject({ owed: 0, paid: 14.25, outstanding: -14.25, receipts: [] });

  await page.goto("/organisation/receipts/balances");
  const card = page.getByTestId("balance-card").filter({ hasText: ADA });
  await expect(card).toBeVisible({ timeout: SLOW });
  await revealMoney(page);
  await expect(figure(card, "OWED")).toContainText("£0.00");
  await expect(figure(card, "OVERPAID")).toContainText("£14.25");
  await card.getByRole("button", { name: "0 receipts", exact: true }).click();
  await expect(card.getByText("Nothing owed on any receipt — this balance is what a payment left behind.")).toBeVisible();

  // Undoing the payments (API only) takes her off the page.
  for (const id of [...made.settlements]) {
    expect((await request.delete(`/api/receipts/settlements?id=${id}`, { timeout: SLOW })).status()).toBe(200);
    expect((await request.delete(`/api/receipts/settlements?id=${id}`, { timeout: SLOW })).status()).toBe(404);
    made.settlements.delete(id);
  }
  expect((await request.delete("/api/receipts/settlements", { timeout: SLOW })).status()).toBe(400);
  expect((await balances(request)).find((b) => b.person_id === personId(ADA))).toBeUndefined();
});

// --------------------------------------------------- findings left standing

// FINDING (docs/receipts-phase3-verification.md §4.2, still open): the screen
// offers no way to delete a receipt. DELETE /api/receipts/[id] works (checked
// above), but with the reader off or a bad photo every failed upload stays in
// the list for good unless it is merged away. Suggested fix: a Delete button
// in the detail header of components/purchases/ReceiptsClient.tsx, behind the
// same window.confirm the merge uses.
test.fixme("a receipt can be deleted from the screen", async ({ page, request }) => {
  const id = await uploadByApi(request);
  await openReceipt(page, id);
  page.once("dialog", (dialog) => void dialog.accept());
  await during(page, "DELETE", new RegExp(`/api/receipts/${id}$`), () => page.getByRole("button", { name: "Delete receipt" }).click());
  expect((await request.get(`/api/receipts/${id}`, { timeout: SLOW })).status()).toBe(404);
});

// FINDING (docs/receipts-phase3-verification.md §4.3, still open): the printed
// total, the date and the retailer are accepted by PATCH /api/receipts/[id]
// but cannot be edited on the screen. A receipt held at `no_total`, or one the
// reader got the total wrong on, can only be resolved through the API.
// Suggested fix: make RECEIPT TOTAL an in-place field like the title, and
// re-run reconcile() in the PATCH route when `total` changes (today the route
// stores the new total without re-judging the status).
test.fixme("the printed total can be corrected on the screen and the receipt is re-judged", async ({ page, request }) => {
  const id = await uploadByApi(request);
  enterParsedReceipt(id, { retailer: `${TAG} Kiosk`, purchased_at: "2031-03-17", total: null, lines: BAKERY_LINES });
  await openReceipt(page, id);
  await expect(page.getByText("no_total")).toBeVisible();
  await revealMoney(page);
  await page.getByLabel("Receipt total").fill("6");
  await during(page, "PATCH", new RegExp(`/api/receipts/${id}$`), () => page.getByLabel("Receipt total").press("Enter"));
  await expect(badge(page, "PARSED")).toBeVisible();
  expect((await detail(request, id)).receipt).toMatchObject({ total: 6, status: "parsed", review_reason: null });
});
