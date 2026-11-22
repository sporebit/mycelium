"use client";

/**
 * The family space (master run §8): where the pregnancy stands or how old
 * the baby is, what is coming up, and the seven things kept here. Before
 * there is a family space, the page offers to make one from a team the
 * person is in. The first time each person arrives they are told, once,
 * that everything here is seen by everyone in it.
 */
import { useState } from "react";
import { Button, Label, SegmentedControl, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { FamilyTab } from "@/lib/family/tabs";
import { BabyLog } from "./BabyLog";
import { Budget } from "./Budget";
import { Calendar } from "./Calendar";
import { Household } from "./Household";
import { Letters } from "./Letters";
import { Names } from "./Names";
import { PrepLists } from "./PrepLists";
import { Timeline } from "./Timeline";
import Link from "next/link";
import type { CalendarStatus } from "@/lib/family/calendar/sync";
import { INPUT, dayLabelYear, send, whenLabel, type FamilyView, type Overview } from "./api";

const TAB_LABEL: Record<FamilyTab, string> = { timeline: "Timeline", calendar: "Calendar", baby: "Baby log", names: "Names", lists: "Lists", letters: "Letters", home: "Household", budget: "Budget" };
const SYNC_CLASS: Record<CalendarStatus["staleness"]["level"], string> = { ok: "text-text-lo", amber: "text-warn", red: "text-danger", never: "text-text-lo" };

function SetUp({ candidates, onDone }: { candidates: Array<{ id: string; label: string }>; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Surface className="mx-auto flex max-w-xl flex-col gap-3 p-6" data-testid="family-setup">
      <h1 className="text-lg text-text-hi">The family space</h1>
      <p className="text-sm text-text-mid">
        One place for the two of you: the pregnancy week by week, scans and appointments, name ideas, the lists of what to get, letters to the baby, the baby log, and the household&rsquo;s paperwork and bills. Everything in it is seen by everyone in the team it belongs to.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-text-mid">
          It lives in a team. Create one in <a className="text-glow-2 hover:underline" href="/other/settings/people">Settings, People &amp; teams</a>, invite the other person, then come back here.
        </p>
      ) : (
        <>
          <p className="text-sm text-text-mid">Choose the team it belongs to.</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <Button
                key={c.id}
                variant="primary"
                loading={busy === c.id}
                disabled={busy !== null}
                onClick={() => {
                  setBusy(c.id);
                  setError(null);
                  void send("POST", "/api/family", { action: "setup", space: c.id })
                    .then(onDone)
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setBusy(null));
                }}
              >
                Use {c.label}
              </Button>
            ))}
          </div>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
    </Surface>
  );
}

function Dates({ family, onSaved }: { family: Overview; onSaved: () => Promise<unknown> }) {
  const [due, setDue] = useState(family.profile.due_on ?? "");
  const [born, setBorn] = useState(family.profile.born_on ?? "");
  const [name, setName] = useState(family.profile.baby_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void send("PATCH", "/api/family", { due_on: due || null, born_on: born || null, baby_name: name })
          .then(onSaved)
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-text-mid">
        Due date
        <input type="date" className={INPUT} value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-mid">
        Born on
        <input type="date" className={INPUT} value={born} max={family.today} onChange={(e) => setBorn(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-mid">
        Name, once there is one
        <input className={INPUT} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <Button type="submit" loading={busy}>
        Save
      </Button>
      {error ? <p role="alert" className="w-full text-sm text-v2-error">{error}</p> : null}
    </form>
  );
}

function Header({ family, sync, onSaved }: { family: Overview; sync: CalendarStatus | null; onSaved: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(!family.profile.due_on && !family.profile.born_on);
  const p = family.pregnancy;
  const who = family.profile.baby_name || "The baby";
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="family-header">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          {family.baby ? (
            <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi" data-testid="family-headline">
              {who} is {family.baby.label}
            </h1>
          ) : p ? (
            <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi" data-testid="family-headline">
              Week {p.week}
              <span className="ml-2 text-base text-text-mid">
                {p.label} · {p.days_to_go > 0 ? `${p.days_to_go} days to go` : p.days_to_go === 0 ? "due today" : `${-p.days_to_go} days past the due date`}
              </span>
            </h1>
          ) : (
            <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi" data-testid="family-headline">
              The family space
            </h1>
          )}
          <p className="text-xs text-text-lo">{family.members.map((m) => (m.me ? "You" : m.name)).join(" and ")}</p>
          {sync?.connected ? (
            // the Family calendar on Google: "Last synced 3 min ago", amber past an hour, red past a day (family calendar spec §4.4)
            <p className={`text-xs ${sync.needs_reconnect ? "text-danger" : SYNC_CLASS[sync.staleness.level]}`} data-testid="family-sync-line">
              <Link href="/family?tab=calendar" className="hover:underline">
                Google · {sync.needs_reconnect ? "Reconnect needed" : sync.staleness.label}
                {sync.queue_line ? ` · ${sync.queue_line}` : ""}
              </Link>
            </p>
          ) : null}
        </div>
        <button type="button" className="text-xs text-text-lo underline hover:text-text-hi" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Dates"}
        </button>
      </div>
      {p ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="How far along" aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.min(40, p.week)}>
          <div className="h-full bg-glow" style={{ width: `${Math.round(p.progress * 100)}%` }} />
        </div>
      ) : null}
      {p && p.signposts.length ? (
        <ul className="flex flex-col gap-1 text-sm text-text-mid">
          {p.signposts.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li className="text-xs text-text-lo">From the standard NHS schedule. Your midwife&rsquo;s dates are the ones that count.</li>
        </ul>
      ) : null}
      {!p && !family.baby && !editing ? <p className="text-sm text-text-mid">Add the due date and the weeks count themselves.</p> : null}
      {editing ? (
        <Dates
          family={family}
          onSaved={async () => {
            await onSaved();
            setEditing(false);
          }}
        />
      ) : null}
      {family.upcoming.length ? (
        <div>
          <Label>Coming up</Label>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {family.upcoming.map((u) => (
              <li key={u.id} className="flex flex-wrap gap-x-3 text-text-mid">
                <span className="text-text-hi">{u.title}</span>
                <span>{whenLabel(u.starts_at)}</span>
                {u.place ? <span className="text-text-lo">{u.place}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {family.profile.due_on && !family.baby ? <p className="text-xs text-text-lo">Due {dayLabelYear(family.profile.due_on)}</p> : null}
    </Surface>
  );
}

export function FamilyClient({ initialTab }: { initialTab: FamilyTab }) {
  const { data, error, mutate } = useApi<FamilyView>("/api/family", { revalidateOnFocus: false });
  const { data: cal } = useApi<{ status: CalendarStatus }>("/api/family/calendar", { revalidateOnFocus: false });
  const [tab, setTab] = useState<FamilyTab>(initialTab);
  const [ackError, setAckError] = useState<string | null>(null);
  const refresh = () => mutate();

  if (error) return <p className="p-6 text-sm text-text-mid">The family space could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="p-6 text-sm text-text-lo">Loading…</p>;
  if (!data.family) return <div className="px-4 py-8"><SetUp candidates={data.candidates ?? []} onDone={refresh} /></div>;

  const family = data.family;
  const me = family.members.find((m) => m.me);
  // The baby log leads once the baby is here; before that the timeline does.
  const order: FamilyTab[] = family.baby ? ["baby", "timeline", "calendar", "letters", "names", "lists", "home", "budget"] : ["timeline", "calendar", "names", "lists", "letters", "baby", "home", "budget"];
  const pick = (t: string) => {
    setTab(t as FamilyTab);
    // the address says which tab, so a link or a reload lands on the same one
    window.history.replaceState(null, "", `/family?tab=${t}`);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <Header key={`${family.profile.due_on}:${family.profile.born_on}:${family.profile.baby_name}`} family={family} sync={cal?.status ?? null} onSaved={refresh} />

      {me && !me.acked ? (
        <Surface className="flex flex-wrap items-center gap-3 p-4" data-testid="family-ack">
          <p className="min-w-[14rem] flex-1 text-sm text-text-mid">
            Everything you add here is seen by {family.members.filter((m) => !m.me).map((m) => m.name).join(" and ") || "everyone in this team"}: notes, letters, lists and the budget alike. Your own space stays yours.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setAckError(null);
              void send("POST", "/api/family", { action: "ack" })
                .then(refresh)
                .catch((e: Error) => setAckError(e.message));
            }}
          >
            Understood
          </Button>
          {ackError ? <p role="alert" className="w-full text-sm text-v2-error">{ackError}</p> : null}
        </Surface>
      ) : null}

      <div className="overflow-x-auto whitespace-nowrap">
        <SegmentedControl ariaLabel="Family sections" options={order.map((t) => ({ value: t, label: TAB_LABEL[t] }))} value={tab} onChange={pick} />
      </div>

      {tab === "timeline" ? <Timeline family={family} onChanged={() => void refresh()} /> : null}
      {tab === "calendar" ? <Calendar family={family} /> : null}
      {tab === "baby" ? <BabyLog family={family} /> : null}
      {tab === "names" ? <Names family={family} /> : null}
      {tab === "lists" ? <PrepLists /> : null}
      {tab === "letters" ? <Letters family={family} onChanged={() => void refresh()} /> : null}
      {tab === "home" ? <Household /> : null}
      {tab === "budget" ? <Budget family={family} /> : null}
    </div>
  );
}
