import { getOwnProfile } from "@/lib/auth/session";
import { AdminConsole } from "@/app/admin/AdminConsole";

/**
 * Instance-owner console (P12 Part 5). Reaching this render means the
 * middleware saw an aal2 session with a fresh re-auth; the profile check
 * is the second wall. Everything it shows comes from the admin_* functions
 * in migration 0113, which read the access tables and the audit log only —
 * never a content table (asserted by lib/access/admin.test.ts).
 */
export default async function AdminPage() {
  const profile = await getOwnProfile();

  if (!profile?.is_instance_owner) {
    return (
      <div className="flex flex-col gap-2 max-w-xl">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">Admin</h1>
        <p className="text-sm text-ink-3">Only the instance owner can open this page.</p>
      </div>
    );
  }

  return <AdminConsole me={profile.id} />;
}
