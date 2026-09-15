import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

/**
 * In-app copy of a weekly rundown (P12 Part 6). RLS on rundown_issues
 * returns only the caller's own issues, so a non-member — or a member who
 * received no issue — gets a 404, never someone else's copy.
 */
export default async function RundownPage({ params }: { params: Promise<{ team: string; week: string }> }) {
  const { team, week } = await params;
  const me = await getSessionUser();
  if (!me || !/^\d{4}-W\d{2}$/.test(week)) notFound();

  const db = await createUserClient();
  const { data: issue } = await db
    .from("rundown_issues")
    .select("rendered_html, created_at, team_id")
    .eq("team_id", team)
    .eq("week", week)
    .eq("channel", "in_app")
    .maybeSingle();
  if (!issue) notFound();

  const { data: teamRow } = await db.from("teams").select("name").eq("id", team).maybeSingle();

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          {teamRow?.name ?? "Team"} rundown
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Week {week}, rendered for you on {new Date(issue.created_at as string).toLocaleDateString()}.
        </p>
      </header>
      {/* Our own renderer's output, HTML-escaped at render time. */}
      <article
        className="rounded-v2-md bg-surface-1 p-5 text-sm text-text-hi [&_a]:underline [&_h1]:text-text-0 [&_h2]:text-ink-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:py-0.5"
        dangerouslySetInnerHTML={{ __html: issue.rendered_html as string }}
      />
    </div>
  );
}
