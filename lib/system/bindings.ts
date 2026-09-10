/**
 * Which user an inbound integration acts for.
 *
 * Secret-authenticated routes (Telegram webhook, Apple Health import, PC
 * metrics agent, cron) have no session. They must never take the user from
 * the request — a caller holding the shared secret could otherwise name any
 * user. The binding lives here, in configuration.
 *
 * By decision (P12), every integration is Phil-only: non-Phil users get web
 * and push only. So every binding resolves to Phil today. When that changes
 * (a second Telegram account, say) the lookup moves to a table keyed on the
 * integration's own identifier, still never on a request header.
 */
import { PHIL_AUTH_UID } from "@/lib/system/identity";

export type Integration =
  | "telegram"
  | "health_import"
  | "pc_metrics"
  | "cron"
  | "api_secret"
  | "google_sync"
  | "spotify";

const BINDINGS: Readonly<Record<Integration, string>> = {
  telegram: PHIL_AUTH_UID,
  health_import: PHIL_AUTH_UID,
  pc_metrics: PHIL_AUTH_UID,
  cron: PHIL_AUTH_UID,
  api_secret: PHIL_AUTH_UID,
  google_sync: PHIL_AUTH_UID,
  spotify: PHIL_AUTH_UID,
};

/** The auth uid an integration acts as. Throws rather than guessing. */
export function boundUser(integration: Integration): string {
  const uid = BINDINGS[integration];
  if (!uid) throw new Error(`No user bound to integration "${integration}"`);
  return uid;
}

/**
 * Users a cron job should run for. Today: Phil. Part 6 (rundowns) iterates
 * recipients from its own tables instead of this list.
 */
export function cronUsers(): readonly string[] {
  return [PHIL_AUTH_UID];
}
