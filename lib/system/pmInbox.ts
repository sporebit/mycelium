/**
 * The PhirstMaxx inbox token, resolved to its owner (spec §5 "Anywhere").
 * The inbox route has no session, so the lookup needs the service client;
 * this is the one place that may hold it for PhirstMaxx, and all it does is
 * hash the token and read two columns. Everything after that runs as the
 * owner through withUser(), under RLS.
 */
import { inboxOwner } from "@/lib/phirstmaxx/server";
import { createServiceClient } from "./serviceClient";

export async function resolveInboxToken(token: string): Promise<{ space_id: string; person_id: string } | null> {
  return inboxOwner(createServiceClient(), token);
}
