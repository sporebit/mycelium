/**
 * The 2026-10-29 photo-extractor guards (7bed43a, e2c9e13) with cloud AI
 * switched off, which is how this server runs.
 *
 * The guards themselves sit after the model's answer and are exercised with
 * the model stubbed in app/api/health/extractor-guards.test.ts (vitest).
 * What a browser can show here is the other half: with no model to ask, a
 * parser must say so without a server error and must never hand back a
 * result, and the form behind it must stay usable.
 */
import { expect as baseExpect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

// a 1×1 PNG: the kind of input the guards were written for
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

type Extractor = { name: string; path: string; send: (request: APIRequestContext) => Promise<APIResponse>; resultKeys: string[] };

const EXTRACTORS: Extractor[] = [
  {
    name: "recipe photo",
    path: "/api/health/recipes/parse",
    send: (request) => request.post("/api/health/recipes/parse", { multipart: { image: { name: "pixel.png", mimeType: "image/png", buffer: PIXEL } } }),
    resultKeys: ["recipe", "ok"],
  },
  {
    name: "eye prescription photo",
    path: "/api/health/eye-prescription/parse",
    send: (request) => request.post("/api/health/eye-prescription/parse", { multipart: { image: { name: "pixel.png", mimeType: "image/png", buffer: PIXEL } } }),
    resultKeys: ["prescription", "ok"],
  },
  {
    name: "blood test PDF",
    path: "/api/health/blood-tests/parse",
    send: (request) => request.post("/api/health/blood-tests/parse", { multipart: { file: { name: "empty.pdf", mimeType: "application/pdf", buffer: PDF } } }),
    resultKeys: ["parsed"],
  },
  {
    name: "nutrition label photo",
    path: "/api/nutrition/foods/scan-label",
    send: (request) => request.post("/api/nutrition/foods/scan-label", { data: { image_base64: PIXEL.toString("base64"), media_type: "image/png" } }),
    resultKeys: ["extracted"],
  },
];

for (const x of EXTRACTORS) {
  test(`${x.name}: with AI off the parser answers with an error in words and invents nothing`, async ({ request }) => {
    const res = await x.send(request);
    expect(res.status(), "an input with nothing to extract is never a success").toBeGreaterThanOrEqual(400);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    for (const key of x.resultKeys) expect(body, `no "${key}" in a refusal`).not.toHaveProperty(key);
  });

  // Fixed 2026-11-20: these answered 500 ("ANTHROPIC_API_KEY missing") with AI off.
  test(`${x.name}: with AI off the parser answers 409 and says to enter it by hand`, async ({ request }) => {
    const res = await x.send(request);
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/unavailable: no AI key is set on this server\. Enter the .+ by hand\.$/);
  });
}

test("Add recipe: a scan that cannot run shows its error, clears the busy state and leaves the form usable", async ({ page }) => {
  await page.goto("/health/recipes");
  await page.getByRole("button", { name: "ADD RECIPE" }).click();
  await expect(page.getByRole("heading", { name: "Add Recipe" })).toBeVisible();
  // Watched from here on: this check is about the scan. (On the compiled end-to-end build the page
  // itself throws once on load, from the service worker registration; that is reported separately.)
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  const answered = page.waitForResponse((r) => r.url().endsWith("/api/health/recipes/parse"));
  await page.locator('input[type="file"]').first().setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PIXEL });
  const res = await answered;
  expect(res.status(), "no server error from a scan that cannot run").toBe(409);
  const { error } = (await res.json()) as { error: string };
  expect(error).toContain("Enter the recipe by hand");

  await expect(page.getByText(error, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SCAN RECIPE" })).toBeEnabled();
  await expect(page.getByText("READING RECIPE…")).toHaveCount(0);
  // nothing was filled in from a scan that did not happen
  const title = page.getByPlaceholder("Recipe name");
  await expect(title).toHaveValue("");
  await expect(page.getByText(/ADD ANOTHER PAGE/)).toHaveCount(0);
  await title.fill("E2E-fixes-1029 typed by hand");
  await expect(title).toHaveValue("E2E-fixes-1029 typed by hand");
  expect(crashes).toEqual([]);
});
