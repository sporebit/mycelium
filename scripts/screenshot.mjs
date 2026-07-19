import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HOST = process.env.SCREENSHOT_HOST ?? "myphelium.sporebit.com";
const BASE_URL = `https://${HOST}`;

const ROUTES = [
  "/",
  "/organisation/tasks",
  "/organisation/calendar",
  "/ventures",
  "/ventures/tree",
  "/fitness",
  "/health/nutrition",
  "/health/supplements",
  "/finance",
  "/finance/spending",
  "/drops/calendar",
  "/the-boys",
  "/studio/pc",
];

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  { label: "mobile",  width: 390,  height: 844, deviceScaleFactor: 2, isMobile: true  },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "screenshots");

function slugForRoute(route) {
  const trimmed = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
  return trimmed;
}

function log(msg) {
  process.stdout.write(msg + "\n");
}

async function main() {
  const cookieName = process.env.AUTH_COOKIE_NAME;
  const cookieValue = process.env.AUTH_COOKIE_VALUE;

  if (!cookieName || !cookieValue) {
    console.error("Missing AUTH_COOKIE_NAME or AUTH_COOKIE_VALUE in env. Aborting.");
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  let loginRedirectDetected = false;

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
      });

      await context.addCookies([
        {
          name: cookieName,
          value: cookieValue,
          domain: HOST,
          path: "/",
          secure: true,
          httpOnly: false,
          sameSite: "Lax",
        },
      ]);

      for (const route of ROUTES) {
        if (loginRedirectDetected) break;

        const page = await context.newPage();
        const targetUrl = `${BASE_URL}${route}`;
        const slug = slugForRoute(route);
        const outPath = path.join(OUT_DIR, `${slug}-${vp.width}.png`);

        try {
          const response = await page.goto(targetUrl, {
            waitUntil: "networkidle",
            timeout: 45_000,
          });

          const finalUrl = page.url();
          if (finalUrl.includes("/login")) {
            console.error(
              `\n[cookie-invalid] ${route} (${vp.label}) redirected to /login — final URL: ${finalUrl}`,
            );
            console.error(
              "Auth cookie is missing, expired, or does not match the deployed AUTH_SECRET. Stopping.",
            );
            loginRedirectDetected = true;
            await page.close();
            break;
          }

          await page.waitForTimeout(1500);

          await page.screenshot({ path: outPath, fullPage: true });

          const status = response?.status() ?? "unknown";
          log(`  ok   ${vp.label.padEnd(7)} ${route.padEnd(28)} → ${slug}-${vp.width}.png (HTTP ${status})`);
          results.push({ route, viewport: vp.label, status: "ok", file: `${slug}-${vp.width}.png` });
        } catch (err) {
          log(`  fail ${vp.label.padEnd(7)} ${route.padEnd(28)} — ${err instanceof Error ? err.message : String(err)}`);
          results.push({ route, viewport: vp.label, status: "fail", error: String(err) });
        } finally {
          await page.close();
        }
      }

      await context.close();
      if (loginRedirectDetected) break;
    }
  } finally {
    await browser.close();
  }

  const captured = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "fail").length;
  log(`\nCaptured ${captured} screenshots, ${failed} failures.`);

  if (loginRedirectDetected) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
