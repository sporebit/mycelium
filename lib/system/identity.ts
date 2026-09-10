/**
 * Identity constants for the multi-user migration (P12).
 *
 * The single-user app identified its user by the USER_ID environment
 * variable, a text value. Supabase Auth identifies users by uuid. This is
 * the mapping between the two, and it is the ONLY place it lives in
 * TypeScript. SQL carries the same mapping in app.legacy_user_uid(text)
 * (migration 0102); `identity.test.ts` proves the two agree against the
 * local stack, so neither can drift without a failing test.
 *
 * Part 2's backfill converts every `user_id text` column through the SQL
 * function. Part 7 (cutover) creates Phil's live auth user with this exact
 * id before he first signs in, so the mapping holds in production.
 *
 * Nothing here is secret: a user id is an identifier, not a credential.
 */

/** The value the USER_ID environment variable has always held. */
export const LEGACY_USER_ID = "phil";

/** Phil's Supabase Auth user id. Fixed, not generated — see the header. */
export const PHIL_AUTH_UID = "f218ed69-6cbf-49ea-908a-8826f2f1178a";

const LEGACY_TO_AUTH: Readonly<Record<string, string>> = {
  [LEGACY_USER_ID]: PHIL_AUTH_UID,
};

/**
 * Map a legacy USER_ID text value to an auth uid. Returns null for anything
 * unknown — callers must treat that as a stop, never coerce.
 */
export function legacyUserIdToAuthUid(legacyId: string): string | null {
  return LEGACY_TO_AUTH[legacyId] ?? null;
}
