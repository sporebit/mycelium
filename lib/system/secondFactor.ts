/**
 * The second-factor lockout (0114, hardened in 0160): ten wrong codes in
 * fifteen minutes lock code entry for that user.
 *
 * The counters are written with the service role, for a user the SERVER
 * names. Until 0160 the functions acted on auth.uid() and were callable by
 * the signed-in user, so a password-only session could clear its own
 * lockout between guesses.
 */
import { createServiceClient } from "./serviceClient";

/** Fails open on a database error (logged), like the rate limiter: a broken counter must not lock the owner out. */
export async function secondFactorLocked(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("second_factor_locked", { p_user: userId });
  if (error) {
    console.error("[second-factor] locked check failed open:", error.message);
    return false;
  }
  return data === true;
}

/** Records a wrong code; true when this one tripped the lock. */
export async function secondFactorFailed(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("second_factor_failed", { p_user: userId });
  if (error) {
    console.error("[second-factor] failure not recorded:", error.message);
    return false;
  }
  return data === true;
}

export async function secondFactorSucceeded(userId: string): Promise<void> {
  const { error } = await createServiceClient().rpc("second_factor_succeeded", { p_user: userId });
  if (error) console.error("[second-factor] failures not cleared:", error.message);
}
