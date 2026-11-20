/**
 * Who the nightly jobs run for.
 *
 * A cron has no session, so it cannot ask RLS "whose data is there?". This
 * is the one read that needs the service role: the list of people who can
 * sign in. Everything a job then does for a person, it does AS that person
 * through withUser(), so RLS still decides what it may touch.
 */
import { createServiceClient } from "./serviceClient";

/** Auth ids of every user who is not disabled. */
export async function activeUserIds(): Promise<string[]> {
  const { data, error } = await createServiceClient().from("profiles").select("id").is("disabled_at", null).limit(500);
  if (error) throw new Error(`could not list users: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
