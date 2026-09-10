/**
 * Weekly rundown delivery (P12 Part 6).
 *
 * The cron calls runRundowns(). For each enabled team and each member who
 * has not opted out and whose slot is now (or `force`), the issue is
 * rendered ONCE PER RECIPIENT under withUser(recipient), so RLS filters
 * that copy to what the recipient may see. Then it is delivered on the
 * recipient's channels: email (Resend), web push (their own subscriptions,
 * read as them), in-app (stored; /rundowns/[team]/[week]), and Telegram —
 * only when the recipient is Phil, by decision.
 *
 * The service-role client is used only to read the access tables that say
 * WHO gets a rundown (rundown_settings, team_members, rundown_subscriptions,
 * profiles, teams) and to store issues. Content is never read as service
 * role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/system/serviceClient";
import { withUser } from "@/lib/system/withUser";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { sendEmail } from "@/lib/system/email";
import { sendToUser } from "@/lib/push";
import { sendMessage } from "@/lib/telegram/api";
import { isoWeek, renderRundown, type RundownContent } from "@/lib/rundowns/render";

export type RunOptions = {
  now?: Date;
  /** Ignore day/hour and send every enabled team's rundown now. */
  force?: boolean;
  /** Only this team (force implied for it). */
  teamId?: string;
  origin: string;
};

export type RunReport = {
  week: string;
  teams: number;
  recipients: number;
  rendered: number;
  skipped: { optedOut: number; notNow: number; alreadySent: number };
  delivered: Record<string, number>;
  errors: string[];
};

type Settings = { team_id: string; enabled: boolean; content: RundownContent; sections: string[]; day: number; hour: number };
type Sub = { user_id: string; team_id: string; channels: string[]; opted_out: boolean; day: number | null; hour: number | null };

export async function runRundowns(opts: RunOptions): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const { week, start, end } = isoWeek(now);
  const admin = createServiceClient();
  const report: RunReport = { week, teams: 0, recipients: 0, rendered: 0, skipped: { optedOut: 0, notNow: 0, alreadySent: 0 }, delivered: {}, errors: [] };

  let q = admin.from("rundown_settings").select("team_id, enabled, content, sections, day, hour").eq("enabled", true);
  if (opts.teamId) q = q.eq("team_id", opts.teamId);
  const { data: settingsRows, error } = await q;
  if (error) throw new Error(error.message);

  for (const s of (settingsRows ?? []) as Settings[]) {
    report.teams++;
    const [{ data: team }, { data: members }, { data: subs }] = await Promise.all([
      admin.from("teams").select("id, name, space_id").eq("id", s.team_id).maybeSingle(),
      admin.from("team_members").select("user_id").eq("team_id", s.team_id),
      admin.from("rundown_subscriptions").select("user_id, team_id, channels, opted_out, day, hour").eq("team_id", s.team_id),
    ]);
    if (!team?.space_id) continue;
    const subByUser = new Map((subs ?? []).map((r) => [r.user_id as string, r as Sub]));

    for (const m of members ?? []) {
      const uid = m.user_id as string;
      report.recipients++;
      const sub = subByUser.get(uid);
      if (sub?.opted_out) {
        report.skipped.optedOut++;
        continue;
      }
      const day = sub?.day ?? s.day;
      const hour = sub?.hour ?? s.hour;
      const due = opts.force || opts.teamId === s.team_id || (now.getUTCDay() === day && now.getUTCHours() === hour);
      if (!due) {
        report.skipped.notNow++;
        continue;
      }
      const channels = (sub?.channels ?? ["email", "push", "in_app"]).filter((c) => c !== "telegram" || uid === PHIL_AUTH_UID);
      if (uid === PHIL_AUTH_UID && !channels.includes("telegram") && !sub) channels.push("telegram");

      const { data: existing } = await admin
        .from("rundown_issues")
        .select("channel")
        .eq("team_id", s.team_id)
        .eq("user_id", uid)
        .eq("week", week);
      const done = new Set((existing ?? []).map((r) => r.channel as string));
      const todo = channels.filter((c) => !done.has(c));
      if (todo.length === 0) {
        report.skipped.alreadySent++;
        continue;
      }

      try {
        const { data: profile } = await admin.from("profiles").select("display_name").eq("id", uid).maybeSingle();
        const { data: user } = await admin.auth.admin.getUserById(uid);
        const email = user.user?.email ?? null;

        // Render as the recipient: RLS decides the content.
        const issue = await withUser(uid, (db) =>
          renderRundown(db, {
            teamId: team.id as string,
            teamName: team.name as string,
            teamSpaceId: team.space_id as string,
            week,
            weekStart: start,
            weekEnd: end,
            content: s.content ?? {},
            sections: s.sections ?? [],
            recipientName: (profile?.display_name as string | null) ?? null,
            origin: opts.origin,
          }),
        );
        report.rendered++;

        for (const channel of todo) {
          let sentAt: string | null = null;
          let err: string | null = null;
          try {
            if (channel === "in_app") {
              sentAt = new Date().toISOString();
            } else if (channel === "email") {
              if (!email) throw new Error("no email");
              const r = await sendEmail({ to: email, subject: `${team.name}: week ${week}`, html: issue.html, text: issue.text });
              if (!r.delivered) throw new Error(r.error ?? "not delivered");
              sentAt = new Date().toISOString();
            } else if (channel === "push") {
              const r = await withUser(uid, (db: SupabaseClient) =>
                sendToUser(db, { title: `${team.name} rundown`, body: `Week ${week}: ${issue.lines} item(s)`, url: `/rundowns/${team.id}/${week}` }),
              );
              if (r.sent === 0) throw new Error("no push subscriptions");
              sentAt = new Date().toISOString();
            } else if (channel === "telegram") {
              const chat = process.env.TELEGRAM_USER_ID;
              if (!chat) throw new Error("TELEGRAM_USER_ID not set");
              await sendMessage(chat, issue.text.slice(0, 4000));
              sentAt = new Date().toISOString();
            }
          } catch (e) {
            err = e instanceof Error ? e.message : String(e);
          }
          const { error: insErr } = await admin.from("rundown_issues").insert({
            team_id: s.team_id,
            user_id: uid,
            week,
            channel,
            rendered_html: issue.html,
            rendered_text: issue.text,
            sent_at: sentAt,
            error: err,
          });
          if (insErr) report.errors.push(`${uid.slice(0, 8)} ${channel}: ${insErr.message}`);
          else if (sentAt) report.delivered[channel] = (report.delivered[channel] ?? 0) + 1;
          else report.errors.push(`${uid.slice(0, 8)} ${channel}: ${err}`);
        }
      } catch (e) {
        report.errors.push(`${uid.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return report;
}
