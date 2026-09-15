/**
 * Server-side helpers for "who is calling". Built on the user-scoped client,
 * so the answer is the verified JWT, not a header the client could set.
 *
 * Route handlers may also read the principal headers middleware.ts sets
 * (lib/auth/gate.ts), which is cheaper for the system principals that have
 * no Supabase session at all; for a browser user these two agree.
 */
import type { AssuranceLevel } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";

export type SessionUser = {
  id: string;
  email: string | null;
  aal: AssuranceLevel;
  sessionId: string | null;
};

export type OwnProfile = {
  id: string;
  display_name: string | null;
  is_instance_owner: boolean;
  personal_space_id: string | null;
};

/** The verified session user, or null when there is no valid session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as Record<string, unknown>;
  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
  };
}

/** The caller's own profile row, or null when signed out or not yet created. */
export async function getOwnProfile(): Promise<OwnProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, is_instance_owner, personal_space_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data as OwnProfile | null) ?? null;
}
