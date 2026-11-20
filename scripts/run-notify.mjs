/**
 * One short Telegram message to Phil from a Claude Code run (master run §15:
 * "what landed, what is blocked on Phil").
 *
 *   node scripts/run-notify.mjs "Phase 0 landed: …"
 *   node scripts/run-notify.mjs --loud "Blocked on you: …"
 *
 * Between 22:00 and 08:00 London time the message is sent silently (it
 * arrives without a sound or a buzz) unless --loud is given. Reads the bot
 * token and chat id from .env.local; prints nothing but ok / the error.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const env = {};
for (const line of readFileSync(path.resolve(import.meta.dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const args = process.argv.slice(2);
const loud = args.includes("--loud");
const text = args.filter((a) => a !== "--loud").join(" ").trim();
if (!text) {
  console.error('usage: node scripts/run-notify.mjs [--loud] "message"');
  process.exit(1);
}
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_USER_ID) {
  console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID missing from .env.local");
  process.exit(1);
}

const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(new Date()));
const quiet = !loud && (hour >= 22 || hour < 8);

const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: env.TELEGRAM_USER_ID, text: text.slice(0, 3800), disable_notification: quiet, disable_web_page_preview: true }),
});
const body = await res.json().catch(() => ({}));
if (!body.ok) {
  console.error(`telegram: ${body.description ?? res.status}`);
  process.exit(1);
}
console.log(quiet ? "ok (silent)" : "ok");
