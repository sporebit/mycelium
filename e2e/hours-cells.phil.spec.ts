/**
 * Hours → typing into a Log cell the way a person does: click or move into
 * it and type. The cell shows one text at rest ("~0:40" for an estimate, the
 * key for a ticket) and the stored text while it is being edited, so this is
 * where "click and edit each row like it's an Excel sheet" (spec §12) can go
 * wrong: what is typed must replace what was there, not be added to it.
 *
 * Real clicks and key presses only; no fill(). Arriving by keyboard selects
 * the cell (typing replaces it); a click is left to the browser and puts the
 * cursor where the pointer is.
 */
import { test, type Page } from "@playwright/test";
import { SLOW, addHeld, blankRow, cell, expect, freeze, getBundle, holding, isEntryWrite, purge, rowById, runId, visit, watch } from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  purge();
  await freeze(page);
});
test.afterAll(() => purge());

async function openLog(page: Page) {
  await visit(page, "/log");
  await expect(blankRow(page)).toBeVisible({ timeout: SLOW });
}
const stored = async (page: Page, id: string) => (await getBundle(page.request)).entries.find((e) => e.id === id)!;

test("tabbing along a row and typing replaces each cell: Estimate, Description, Ticket and Time", async ({ page }) => {
  // The raw ticket is lower case and the estimate is shown with a "~", so both cells swap their text on focus.
  const e = await addHeld(page.request, { date: "2031-03-12", minutes: 30, estimate: 40, description: `${P} cells`, ticket: "zze-310" });
  await openLog(page);
  const row = rowById(holding(page), e.id);
  await expect(cell(row, "estimate")).toHaveValue("~0:40");
  await expect(cell(row, "ticket")).toHaveValue("ZZE-310");
  const patches = watch(page, "PATCH", /^\/api\/hours\/entries\//);

  // A click puts the cursor in the cell and shows the stored text; nothing is saved by looking.
  await cell(row, "time").click();
  await expect(cell(row, "time")).toBeFocused();

  const typeOver = async (col: "estimate" | "description" | "ticket" | "time", text: string, leave: "Tab" | "Enter" | "Shift+Tab") => {
    await expect(cell(row, col)).toBeFocused();
    await page.keyboard.type(text);
    await expect(cell(row, col), `${col} holds only what was typed`).toHaveValue(text);
    const saved = page.waitForResponse(isEntryWrite("PATCH"));
    await page.keyboard.press(leave);
    expect((await saved).status()).toBe(200);
  };

  await page.keyboard.press("Tab");
  await typeOver("estimate", "1:15", "Tab");
  await typeOver("description", `${P} cells retyped`, "Tab");
  await typeOver("ticket", "ZZE-311", "Shift+Tab");
  await page.keyboard.press("Shift+Tab"); // description → estimate, nothing typed, nothing saved
  await page.keyboard.press("Shift+Tab");
  await typeOver("time", "0:50", "Enter");

  expect(await stored(page, e.id)).toMatchObject({ minutes: 50, estimate_minutes: 75, description: `${P} cells retyped`, ticket_raw: "ZZE-311", ticket_key: "ZZE-311" });
  expect(patches, "one save per changed cell, none for the cells only passed through").toHaveLength(4);
});

test("moving into a cell with Tab or Enter and typing replaces what was there", async ({ page }) => {
  const lower = await addHeld(page.request, { date: "2031-03-12", minutes: 20, estimate: 30, description: `${P} lower row`, ticket: "zze-321" });
  const upper = await addHeld(page.request, { date: "2031-03-12", minutes: 10, estimate: 25, description: `${P} upper row`, ticket: "zze-320" });
  await openLog(page);
  const up = rowById(holding(page), upper.id);
  const low = rowById(holding(page), lower.id);

  // Tab from Time lands in Estimate; type over it.
  await cell(up, "time").click();
  await page.keyboard.press("Tab");
  await expect(cell(up, "estimate")).toBeFocused();
  await page.keyboard.type("0:45");
  await expect(cell(up, "estimate"), "Estimate holds only what was typed").toHaveValue("0:45");
  let saved = page.waitForResponse(isEntryWrite("PATCH"));
  // Enter saves and moves down the Estimate column; type over that one too.
  await page.keyboard.press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(cell(low, "estimate")).toBeFocused();
  await page.keyboard.type("0:55");
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await page.keyboard.press("Tab"); // leaving the cell saves it
  expect((await saved).status()).toBe(200);
  expect((await stored(page, upper.id)).estimate_minutes).toBe(45);
  expect((await stored(page, lower.id)).estimate_minutes).toBe(55);

  // Shift+Enter up the Ticket column from the lower row, then type over the upper ticket.
  await cell(low, "ticket").click();
  await page.keyboard.press("Shift+Enter");
  await expect(cell(up, "ticket")).toBeFocused();
  await page.keyboard.type("ZZE-322");
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await page.keyboard.press("Enter");
  expect((await saved).status()).toBe(200);
  expect(await stored(page, upper.id)).toMatchObject({ ticket_raw: "ZZE-322", ticket_key: "ZZE-322" });
  expect((await stored(page, lower.id)).ticket_raw).toBe("zze-321");
});

test.fixme("at phone width the Log's rows can be read and typed into without sideways scrolling", async ({ page }) => {
  // FINDING hours-3: spec §5 says "Speed of entry matters more than anything else on the Log … and wants it usable
  // from the phone." At 390px the row's fixed columns (date 9.5rem, time 4.5rem, estimate 4.5rem, ticket 10rem) are
  // wider than the screen: the Description cell is 14px wide and Ticket and Logged sit off the right edge
  // (components/hours/EntryRow.tsx and NewEntryRow.tsx, the inline gridTemplateColumns). Needs a two-line row below
  // the `sm` breakpoint; how that should look is a design decision, so it is reported, not fixed.
  await page.setViewportSize({ width: 390, height: 844 });
  await openLog(page);
  const blank = blankRow(page);
  const widths = await blank.evaluate((row) => {
    const w = (col: string) => Math.round(row.querySelector<HTMLElement>(`[data-col="${col}"]`)!.getBoundingClientRect().width);
    const right = Math.round(Math.max(...Array.from(row.querySelectorAll<HTMLElement>("[data-col]")).map((el) => el.getBoundingClientRect().right)));
    return { description: w("description"), time: w("time"), right, viewport: window.innerWidth, pageScroll: document.documentElement.scrollWidth };
  });
  // Room to read at least a few words of the description, every cell on screen, and no page-level sideways scroll.
  expect(widths.description, `description cell is ${widths.description}px wide at 390px`).toBeGreaterThanOrEqual(120);
  expect(widths.right, "every cell of the blank row is inside the screen").toBeLessThanOrEqual(widths.viewport);
  expect(widths.pageScroll).toBeLessThanOrEqual(widths.viewport + 1);
});
