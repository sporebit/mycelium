"use client";

import type { WallGlance, WallPerson } from "@/lib/wall/contract";

const SERIF = "font-[family-name:var(--font-plate)]";

/** The week as fill: seven cells, Monday first; a lit cell is a day with something finished. */
export function WeekFill({ week }: { week: number[] }) {
  if (!week.length) return null;
  return (
    <div className="flex gap-1" aria-label="This week">
      {week.map((n, i) => (
        <span key={i} className="h-2.5 w-5 rounded-sm" style={{ background: n < 0 ? "transparent" : n > 0 ? "#cdc7b2" : "rgba(236,230,210,0.18)", border: n < 0 ? "1px solid rgba(236,230,210,0.18)" : "none" }} />
      ))}
    </div>
  );
}

export const hm = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim() : `${minutes}m`);

/** A person's today in numbers ("2 things left · 1h 5m"); null when they have no plan yet. */
export function todayLine(p: WallPerson): string | null {
  if (!p.today) return null;
  return p.today.left === 0 ? (p.today.planned ? "All done today" : "Nothing planned") : `${p.today.left} ${p.today.left === 1 ? "thing" : "things"} left · ${hm(p.today.minutes_left)}`;
}

/** The week's hours as words; null when hours are not tracked. */
export function hoursLine(p: WallPerson): string | null {
  if (p.hours_left == null) return null;
  return p.hours_left > 0 ? `${hm(p.hours_left)} to the week's hours` : "Week's hours met";
}

/** The baby log taps show once there is a baby line or a baby (the countdown reads "Ada is 6 weeks"). */
export function showBabyTaps(glance: WallGlance): boolean {
  const fam = glance.family;
  return !!(fam?.baby_line || (fam && fam.countdown?.includes(" is ")));
}

/** One person on the board: numbers and the week, never a title. A tap asks for their PIN. */
export function PersonCard({ p, onOpen }: { p: WallPerson; onOpen: (id: string) => void }) {
  const body = (
    <>
      <div className={`${SERIF} text-3xl`}>{p.name}</div>
      {p.today ? <div className="mt-2 text-lg opacity-80">{todayLine(p)}</div> : <div className="mt-2 text-lg opacity-60">No plan yet today</div>}
      {p.hours_left != null ? <div className="mt-1 text-base opacity-60">{hoursLine(p)}</div> : null}
      <div className="mt-3">
        <WeekFill week={p.week} />
      </div>
    </>
  );
  return p.can_unlock ? (
    <button type="button" onClick={() => onOpen(p.id)} className="rounded-2xl border p-5 text-left active:scale-[0.98]" style={{ borderColor: "rgba(236,230,210,0.22)" }} aria-label="Open this person's view">
      {body}
    </button>
  ) : (
    <div className="rounded-2xl border p-5 opacity-80" style={{ borderColor: "rgba(236,230,210,0.12)" }}>
      {body}
    </div>
  );
}

export function Board({ glance, onOpen, onBaby }: { glance: WallGlance; onOpen: (id: string) => void; onBaby: (kind: "feed" | "nappy" | "sleep") => void }) {
  const fam = glance.family;
  return (
    <div className="grid h-full grid-cols-5 gap-8">
      <section className="col-span-3 flex flex-col gap-4" aria-label="People">
        <div className="grid grid-cols-2 gap-4">
          {glance.people.map((p) => (
            <PersonCard key={p.id} p={p} onOpen={onOpen} />
          ))}
        </div>
      </section>
      <section className="col-span-2 flex flex-col gap-6" aria-label="Family">
        {fam?.countdown ? <div className={`${SERIF} text-4xl leading-tight`}>{fam.countdown}</div> : null}
        {fam?.upcoming.length ? (
          <ul className="flex flex-col gap-3" aria-label="Coming up">
            {fam.upcoming.map((u) => (
              <li key={u.id} className="flex items-baseline gap-3">
                <span className="w-32 shrink-0 text-base opacity-60">{u.when}</span>
                <span className="text-xl">{u.title}</span>
                {u.place ? <span className="text-base opacity-50">{u.place}</span> : null}
              </li>
            ))}
          </ul>
        ) : fam ? (
          <div className="text-lg opacity-50">Nothing in the family calendar this week</div>
        ) : null}
        {fam && showBabyTaps(glance) ? (
          <div className="mt-auto flex flex-col gap-3">
            {fam.baby_line ? <div className="text-lg opacity-80">{fam.baby_line}</div> : null}
            <div className="flex gap-3" role="group" aria-label="Baby log">
              {(["feed", "nappy", "sleep"] as const).map((k) => (
                <button key={k} type="button" onClick={() => onBaby(k)} className="rounded-full border px-5 py-3 text-lg capitalize active:scale-95" style={{ borderColor: "rgba(236,230,210,0.3)" }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
