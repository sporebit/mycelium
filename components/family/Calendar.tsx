"use client";

/**
 * Family → Calendar: the Family calendar on Google (family calendar spec
 * §4.1, §4.4, §4.5). One calendar in the owner's Google account, shared to
 * the other phone, kept in step with the appointments on the timeline.
 *
 * What it shows depends on who is looking:
 *   - nobody has connected a calendar yet: the person with a Google
 *     connection sees the picker (their calendars by name, or "Create a
 *     Family calendar"); anyone else is told to connect Google in Settings
 *     or to let the owner do it;
 *   - connected: the calendar's name, "Last synced 3 min ago" (amber past
 *     an hour, red past a day), what is waiting to reach Google, the daily
 *     health check with a reconnect link when it failed, and whether
 *     instant updates are on or the 15-minute poll is doing the work;
 *   - the owner also gets Share with…, the reminder setting and Disconnect.
 */
import { useState } from "react";
import Link from "next/link";
import { Button, Label, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { CalendarChoice, CalendarStatus } from "@/lib/family/calendar/sync";
import { INPUT, send, type Overview } from "./api";

type View = { status: CalendarStatus; calendars?: CalendarChoice[]; picker_error?: string | null; acl?: Array<{ email: string; role: string }> };

const LEVEL_CLASS: Record<CalendarStatus["staleness"]["level"], string> = { ok: "text-text-mid", amber: "text-warn", red: "text-danger", never: "text-text-lo" };

export function Calendar({ family }: { family: Overview }) {
  const { data, error, mutate } = useApi<View>("/api/family/calendar?pick=1", { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");

  const act = async (what: string, body: Record<string, unknown>, ok?: (r: Record<string, unknown>) => string | null) => {
    setBusy(what);
    setFail(null);
    setNotice(null);
    try {
      const r = await send<Record<string, unknown>>("POST", "/api/family/calendar", body);
      setNotice(ok ? ok(r) : null);
      await mutate();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-text-mid">The calendar status could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="text-sm text-text-lo">Loading…</p>;
  const s = data.status;
  const owner = s.owner_id ? family.members.find((m) => m.id === s.owner_id) : null;
  const ownerName = owner ? (owner.me ? "you" : owner.name) : "the person who connected it";
  const pulledLine = (r: Record<string, unknown>) => {
    const p = r.pulled as { created?: number; updated?: number; deleted?: number; ok?: boolean; error?: string } | undefined;
    if (!p) return null;
    if (!p.ok) return p.error ?? "The sync did not finish.";
    return `Synced: ${p.created ?? 0} new, ${p.updated ?? 0} changed, ${p.deleted ?? 0} removed.`;
  };

  return (
    <div className="flex flex-col gap-4" data-testid="family-calendar">
      <Surface className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base text-text-hi">The Family calendar on Google</h2>
          {s.connected ? (
            <span className={`text-xs ${LEVEL_CLASS[s.staleness.level]}`} data-testid="family-calendar-synced">
              {s.staleness.label}
            </span>
          ) : null}
        </div>

        {s.connected && s.calendar ? (
          <>
            <p className="text-sm text-text-mid">
              <span className="text-text-hi">{s.calendar.summary}</span> in {ownerName === "you" ? "your" : `${ownerName}'s`} Google account. Appointments added here appear there within seconds, and the other way within {s.channel.on ? "seconds" : "fifteen minutes"}.
            </p>
            {s.needs_reconnect || s.health.ok === false ? (
              <p role="alert" className="rounded-v2-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="family-calendar-reconnect">
                Reconnect needed. {s.health.error ?? s.last_error ?? "Google refused the connection."}{" "}
                {s.owner_is_me ? (
                  <Link href="/other/settings?tab=integrations" className="underline">
                    Reconnect Google in Settings
                  </Link>
                ) : (
                  <>Only {ownerName} can reconnect it, in their Settings.</>
                )}
              </p>
            ) : null}
            {s.queue_line ? <p className="text-xs text-warn" data-testid="family-calendar-queue">{s.queue_line}. They are retried every few minutes.</p> : null}
            {s.last_error && s.health.ok !== false ? <p className="text-xs text-text-lo">Last sync said: {s.last_error}</p> : null}
            <p className="text-xs text-text-lo">
              {s.channel.on ? "Instant updates from Google are on" : s.channel.error ? s.channel.error : "Instant updates are not set up; the 15-minute poll is doing the work."}
              {s.health.checked_at ? ` · Connection checked ${new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(s.health.checked_at))}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" loading={busy === "sync"} onClick={() => void act("sync", { action: "sync" }, pulledLine)}>
                Sync now
              </Button>
              <Link href="/calendar" className="text-xs text-text-lo underline hover:text-text-hi">
                Open the calendar
              </Link>
            </div>
          </>
        ) : s.google_connected ? (
          <Picker data={data} busy={busy} onChoose={(id) => void act(`choose:${id}`, { action: "choose", calendar_id: id }, pulledLine)} onCreate={() => void act("create", { action: "create" }, pulledLine)} />
        ) : (
          <p className="text-sm text-text-mid" data-testid="family-calendar-unconnected">
            Not connected. {owner && !owner.me ? `${owner.name} connects it from their phone: ` : ""}
            <Link href="/other/settings?tab=integrations" className="underline">
              connect Google in Settings → Integrations
            </Link>{" "}
            first, then choose the calendar here. Only the one allowed Google account can connect.
          </p>
        )}

        {notice ? <p role="status" className="text-sm text-text-mid">{notice}</p> : null}
        {fail ? <p role="alert" className="text-sm text-v2-error">{fail}</p> : null}
      </Surface>

      {s.connected && s.owner_is_me ? (
        <Surface className="flex flex-col gap-3 p-4" data-testid="family-calendar-owner">
          <div>
            <Label>Shared with</Label>
            {data.acl && data.acl.length ? (
              <ul className="mt-1 flex flex-col gap-1 text-sm text-text-mid">
                {data.acl.map((a) => (
                  <li key={a.email}>
                    <span className="text-text-hi">{a.email}</span> · {a.role === "owner" ? "owner" : a.role === "writer" ? "can change events" : a.role}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-text-lo">Only you so far.</p>
            )}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!shareEmail.trim()) return;
              void act("share", { action: "share", email: shareEmail.trim() }, () => {
                setShareEmail("");
                return "Shared. Google has sent them an invitation; the calendar appears in their Google Calendar once they accept.";
              });
            }}
          >
            <input type="email" className={`${INPUT} min-w-[14rem] flex-1`} aria-label="Share with (email)" placeholder="Share with… (their Gmail address)" value={shareEmail} onChange={(ev) => setShareEmail(ev.target.value)} />
            <Button type="submit" size="sm" loading={busy === "share"}>
              Share
            </Button>
          </form>
          <label className="flex items-center gap-2 text-sm text-text-mid">
            <input type="checkbox" checked={s.google_reminders} disabled={busy === "reminders"} onChange={(ev) => void act("reminders", { action: "reminders", on: ev.target.checked })} />
            Let Google remind us too (otherwise only Mycelium does, so nothing buzzes twice)
          </label>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              loading={busy === "disconnect"}
              onClick={() => {
                if (window.confirm("Stop syncing with Google? Appointments already here stay; the Google calendar is left as it is.")) void act("disconnect", { action: "disconnect" });
              }}
            >
              Disconnect
            </Button>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

function Picker({ data, busy, onChoose, onCreate }: { data: View; busy: string | null; onChoose: (id: string) => void; onCreate: () => void }) {
  const calendars = data.calendars ?? [];
  return (
    <div className="flex flex-col gap-3" data-testid="family-calendar-picker">
      <p className="text-sm text-text-mid">Choose the Google calendar that is the Family calendar, or make a new one called Family. Only its appointments are read; nothing else in your Google account is touched.</p>
      {data.picker_error ? <p className="text-sm text-v2-error">{data.picker_error}</p> : null}
      {calendars.length ? (
        <ul className="flex flex-col gap-1">
          {calendars.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-v2-md border border-hairline px-3 py-2 text-sm">
              <span className="text-text-hi">
                {c.summary}
                {c.primary ? <span className="ml-2 text-xs text-text-lo">(your main calendar)</span> : null}
              </span>
              <Button size="sm" loading={busy === `choose:${c.id}`} onClick={() => onChoose(c.id)}>
                Use this
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button variant="primary" size="sm" loading={busy === "create"} onClick={onCreate}>
          Create a Family calendar
        </Button>
      </div>
    </div>
  );
}
