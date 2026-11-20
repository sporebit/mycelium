/**
 * The 2026-10-29 photo-extractor guards (7bed43a, e2c9e13): a parser whose
 * model answers "there is nothing here to extract" refuses with 422 instead
 * of handing back invented values. The end-to-end server runs with cloud AI
 * off, so the guard (which sits after the model's answer) is exercised here
 * with the model call stubbed; the routes are otherwise the real ones.
 *
 * Also here: with no AI key at all, each parser answers 409 with words the
 * form can show and never calls out (they answered 500 before 2026-11-20).
 *
 * The receipt parser's guard (lib/receipts/parse.ts) is covered with the
 * receipts checks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as parseRecipe } from "./recipes/parse/route";
import { POST as parsePrescription } from "./eye-prescription/parse/route";
import { POST as parseBloodTest } from "./blood-tests/parse/route";
import { POST as scanLabel } from "../nutrition/foods/scan-label/route";

const modelSays = (text: string) =>
  vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200, headers: { "content-type": "application/json" } }));

function upload(path: string, field: string, type: string): NextRequest {
  const form = new FormData();
  form.append(field, new File([new Uint8Array([1, 2, 3])], "upload.bin", { type }));
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: form });
}
const recipeReq = () => upload("/api/health/recipes/parse", "image", "image/png");
const prescriptionReq = () => upload("/api/health/eye-prescription/parse", "image", "image/png");
const bloodReq = () => upload("/api/health/blood-tests/parse", "file", "application/pdf");
const labelReq = () =>
  new NextRequest("http://localhost/api/nutrition/foods/scan-label", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_base64: "AQID", media_type: "image/png" }),
  });

let keyBefore: string | undefined;

beforeEach(() => {
  keyBefore = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key-never-sent";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  if (keyBefore === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = keyBefore;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recipe photo parser", () => {
  it("refuses an image the model says holds no recipe", async () => {
    vi.stubGlobal("fetch", modelSays('{"no_recipe": true}'));
    const res = await parseRecipe(recipeReq());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No recipe found in this image" });
  });

  it("refuses it when the model wraps the answer in prose or a code fence", async () => {
    vi.stubGlobal("fetch", modelSays('I could not find a recipe.\n```json\n{"no_recipe": true}\n```'));
    expect((await parseRecipe(recipeReq())).status).toBe(422);
  });

  it("refuses an answer with neither a title nor ingredients", async () => {
    vi.stubGlobal("fetch", modelSays('{"notes": "a photo of a cat"}'));
    expect((await parseRecipe(recipeReq())).status).toBe(422);
  });

  it("refuses an answer that is not JSON at all", async () => {
    vi.stubGlobal("fetch", modelSays("This image is blank."));
    expect((await parseRecipe(recipeReq())).status).toBe(422);
  });

  it("still returns a recipe the model did find", async () => {
    const recipe = { title: "Lentil dahl", ingredients: [{ amount: "200", unit: "g", name: "red lentils", notes: null }], method: [{ step: 1, instruction: "Simmer." }] };
    vi.stubGlobal("fetch", modelSays(JSON.stringify(recipe)));
    const res = await parseRecipe(recipeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recipe });
  });

  it("asks for an image before anything is sent to the model", async () => {
    const fetchMock = modelSays("{}");
    vi.stubGlobal("fetch", fetchMock);
    const res = await parseRecipe(new NextRequest("http://localhost/api/health/recipes/parse", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("eye prescription parser", () => {
  it("refuses an image the model says holds no prescription", async () => {
    vi.stubGlobal("fetch", modelSays('{"no_prescription": true}'));
    const res = await parsePrescription(prescriptionReq());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No prescription found in this image" });
  });

  it("still returns a prescription the model did find", async () => {
    const prescription = { right: { sphere: -1.25, cylinder: -0.5, axis: 90 }, left: { sphere: -1.0, cylinder: null, axis: null } };
    vi.stubGlobal("fetch", modelSays(JSON.stringify(prescription)));
    const res = await parsePrescription(prescriptionReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, prescription });
  });
});

describe("blood test parser", () => {
  it("refuses a document the model says holds no results", async () => {
    vi.stubGlobal("fetch", modelSays('{"no_results": true}'));
    const res = await parseBloodTest(bloodReq());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No blood test results found in this document" });
  });

  it("still returns results the model did find", async () => {
    const parsed = { test_date: "2031-03-04", markers: [{ marker: "hba1c", value: 34, unit: "mmol/mol" }] };
    vi.stubGlobal("fetch", modelSays(JSON.stringify(parsed)));
    const res = await parseBloodTest(bloodReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ parsed });
  });
});

describe("nutrition label scanner", () => {
  it("refuses a photo the model says holds no label", async () => {
    vi.stubGlobal("fetch", modelSays('{"no_label": true}'));
    const res = await scanLabel(labelReq());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No nutrition label found in this photo" });
  });
});

describe("with no AI key set", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["recipe photo parser", () => parseRecipe(recipeReq())],
    ["eye prescription parser", () => parsePrescription(prescriptionReq())],
    ["blood test parser", () => parseBloodTest(bloodReq())],
    ["nutrition label scanner", () => scanLabel(labelReq())],
  ];
  for (const [name, call] of cases) {
    it(`${name} says scanning is unavailable (409) and does not call the model`, async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const fetchMock = modelSays("{}");
      vi.stubGlobal("fetch", fetchMock);
      const res = await call();
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/unavailable: no AI key is set on this server\. Enter the .+ by hand\.$/);
      expect(Object.keys(body)).toEqual(["error"]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});
