/**
 * Environment for the end-to-end server. It points the app at the LOCAL
 * Supabase stack and switches off everything that costs money or reaches a
 * real person: cloud AI, Telegram, email, PayPal, Google, Spotify.
 *
 * Next reads .env.local only for keys the process has not set, so a key set
 * here (even to an empty string) wins over the hosted value in that file.
 */
import path from "node:path";
import { localStackEnv } from "../../lib/access/introspect.ts";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
export const E2E_API_SECRET = "e2e-api-secret";
export const E2E_CRON_SECRET = "e2e-cron-secret";

/** Keys blanked so no test run can spend money or message anyone. */
const SWITCHED_OFF = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_USER_ID",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_SHEETS_FINANCE_ID",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "GITHUB_TOKEN",
  "OPENWEATHER_API_KEY",
  "USDA_API_KEY",
  "STREAMING_AVAILABILITY_API_KEY",
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  // PhirstMaxx research (0185): routing, places, YouTube and the old app's database
  "ORS_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "YOUTUBE_API_KEY",
  "PHIRSTMAXX_OLD_DB_URL",
  "GOOGLE_ALLOWED_ACCOUNTS",
] as const;

export function e2eServerEnv(): Record<string, string> {
  const local = localStackEnv();
  const env: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    SUPABASE_JWT_SECRET: local.jwtSecret,
    API_SECRET: E2E_API_SECRET,
    CRON_SECRET: E2E_CRON_SECRET,
    PUBLIC_BASE_URL: E2E_ORIGIN,
    USER_TIMEZONE: "Europe/London",
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_TELEMETRY_DISABLED: "1",
    // The Finds feed's watchers read these files instead of GitHub, Hacker News and the feeds (lib/finds/fixtures.ts).
    FINDS_FIXTURE_DIR: path.resolve(process.cwd(), "e2e/fixtures/finds"),
  };
  for (const key of SWITCHED_OFF) env[key] = "";
  // A client id (not a secret) so /api/google/auth builds its redirect and sets its state cookie; the specs stub
  // accounts.google.com, and with no client secret the callback stops at config_error after the state check.
  env.GOOGLE_CLIENT_ID = "e2e-google-client";
  return env;
}
