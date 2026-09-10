import { getOwnProfile } from "@/lib/auth/session";

/**
 * Instance-owner console. Part 5 builds the real thing (users, teams,
 * memberships, grants, invites, audit). This placeholder exists so the
 * middleware's aal2 rule for /admin has a page to guard and VERIFY 1 can
 * prove the 403.
 *
 * Reaching this render at all means middleware saw an aal2 session. The
 * profile check is the second wall: only the instance owner may see it.
 */
export default async function AdminPage() {
  const profile = await getOwnProfile();

  if (!profile?.is_instance_owner) {
    return (
      <div className="flex flex-col gap-2 max-w-xl">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Admin
        </h1>
        <p className="text-sm text-ink-3">
          Only the instance owner can open this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        Admin
      </h1>
      <p className="text-sm text-ink-3">
        Signed in as {profile.display_name ?? "the instance owner"} with a
        second factor. Users, teams, grants and the audit log arrive here in
        Part 5.
      </p>
    </div>
  );
}
