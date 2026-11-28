"use client";

/**
 * The wall's family board as a plain tile grid (brief 6.20 and 6b; design
 * docs/run/2026-11-28/field-guide-design.md §6, D10): six columns, tiles of
 * varying sizes, what is on today the largest. It draws the same WallGlance
 * as the classic Board and adds nothing to it: people are numbers and the
 * week fill (titles still wait for the unlock), today's family events and
 * the countdown hold the big tile, weather and bins are small tiles, and
 * the baby line sits with its three taps.
 *
 * Flat, in the Field palette: paper-2 tiles, one hairline, radius 10, no
 * shadow. Read from across the room, so the type is large. Nothing here
 * moves on its own.
 */
import type { ReactNode } from "react";
import type { WallEvent, WallGlance, WallPerson } from "@/lib/wall/contract";
import { WeekFill, hoursLine, showBabyTaps, todayLine } from "./Board";

const BODY = "font-[family-name:var(--fg-font-body)]";
const MONO = "font-[family-name:var(--fg-font-mono)] tabular-nums";
const SOFT = "text-[color:var(--fg-ink-soft)]";
/** The global h1..h6 rule sits outside the utility layer and would win over a class; the Field face is set inline. */
const FACE = { fontFamily: "var(--fg-font-body)" } as const;

function Tile({ span, label, children, testId, className = "" }: { span: string; label: string; children: ReactNode; testId: string; className?: string }) {
  return (
    <section aria-label={label} data-testid={testId} className={`flex min-w-0 flex-col gap-3 rounded-[10px] border border-[color:var(--fg-line)] bg-[var(--fg-paper-2)] p-6 text-[color:var(--fg-ink)] ${span} ${className}`}>
      {children}
    </section>
  );
}

/** "Today 14:00" → "14:00" for an event already filed under Today. */
const timeOf = (e: WallEvent) => e.when.replace(/^Today\s+/, "");

function TodayTile({ glance }: { glance: WallGlance }) {
  const fam = glance.family;
  const today = (fam?.upcoming ?? []).filter((e) => e.when.startsWith("Today"));
  const later = (fam?.upcoming ?? []).filter((e) => !e.when.startsWith("Today")).slice(0, 3);
  return (
    <Tile span="col-span-4 row-span-2" label="Today" testId="wall-tile-today" className="gap-5 p-8">
      <h2 style={FACE} className={`${BODY} text-[30px] font-medium leading-tight`}>Today</h2>
      {fam?.countdown ? <p className={`${BODY} text-[44px] leading-[1.1] [text-wrap:balance]`}>{fam.countdown}</p> : null}
      {today.length ? (
        <ul className="flex flex-col gap-3" aria-label="On today">
          {today.map((e) => (
            <li key={e.id} className="flex items-baseline gap-5">
              <span className={`${MONO} w-[5.5rem] shrink-0 text-[26px]`}>{timeOf(e)}</span>
              <span className={`${BODY} text-[30px] leading-tight`}>{e.title}</span>
              {e.place ? <span className={`text-[20px] ${SOFT}`}>{e.place}</span> : null}
            </li>
          ))}
        </ul>
      ) : fam ? (
        <p className={`${BODY} text-[26px] ${SOFT}`}>Nothing in the family calendar today.</p>
      ) : (
        <p className={`${BODY} text-[26px] ${SOFT}`}>The family calendar is not set up on this wall yet.</p>
      )}
      {later.length ? (
        <div className="mt-auto flex flex-col gap-2 border-t border-[color:var(--fg-line)] pt-4">
          <h3 style={FACE} className={`${BODY} text-[20px] font-medium`}>Coming up</h3>
          <ul className="flex flex-col gap-1.5" aria-label="Coming up">
            {later.map((e) => (
              <li key={e.id} className="flex items-baseline gap-4 text-[20px]">
                <span className={`${MONO} w-[11rem] shrink-0 text-[18px] ${SOFT}`}>{e.when}</span>
                <span className={BODY}>{e.title}</span>
                {e.place ? <span className={`text-[17px] ${SOFT}`}>{e.place}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Tile>
  );
}

/** One person: numbers and the week, never a title. With a PIN set, the tile is the door to their view. */
function PersonTile({ p, onOpen }: { p: WallPerson; onOpen: (id: string) => void }) {
  const line = todayLine(p);
  const hours = hoursLine(p);
  const body = (
    <>
      <span className={`${BODY} text-[30px] font-medium leading-none`}>{p.name}</span>
      <span className={`text-[20px] ${line ? "" : SOFT}`}>{line ?? "No plan yet today"}</span>
      {hours ? <span className={`text-[17px] ${SOFT}`}>{hours}</span> : null}
      <span className="mt-auto pt-2">
        <WeekFill week={p.week} />
      </span>
    </>
  );
  const cls = "col-span-2 flex min-w-0 flex-col gap-2 rounded-[10px] border border-[color:var(--fg-line)] bg-[var(--fg-paper-2)] p-6 text-left text-[color:var(--fg-ink)]";
  return p.can_unlock ? (
    <button type="button" onClick={() => onOpen(p.id)} className={`${cls} active:bg-[var(--fg-paper-3)]`} aria-label="Open this person's view" data-testid="wall-tile-person">
      {body}
    </button>
  ) : (
    <div className={cls} data-testid="wall-tile-person">
      {body}
    </div>
  );
}

export function TilesBoard({ glance, onOpen, onBaby }: { glance: WallGlance; onOpen: (id: string) => void; onBaby: (kind: "feed" | "nappy" | "sleep") => void }) {
  const fam = glance.family;
  return (
    <div className="grid h-full grid-flow-row-dense auto-rows-[minmax(150px,auto)] grid-cols-6 gap-4" data-testid="wall-tiles">
      <TodayTile glance={glance} />
      {glance.people.map((p) => (
        <PersonTile key={p.id} p={p} onOpen={onOpen} />
      ))}
      {glance.weather ? (
        <Tile span="col-span-1" label="Weather" testId="wall-tile-weather">
          <h2 style={FACE} className={`${BODY} text-[20px] font-medium`}>Weather</h2>
          <p className="text-[20px] leading-snug">{glance.weather.conditions}</p>
          <p className={`${MONO} mt-auto text-[24px]`}>
            {Math.round(glance.weather.hi)}° <span className={SOFT}>/ {Math.round(glance.weather.lo)}°</span>
          </p>
        </Tile>
      ) : null}
      {glance.bins ? (
        <Tile span="col-span-1" label="Bins" testId="wall-tile-bins">
          <h2 style={FACE} className={`${BODY} text-[20px] font-medium`}>Bins</h2>
          <p className="text-[20px] leading-snug">{glance.bins.days === 0 ? "Today" : glance.bins.days === 1 ? "Tomorrow" : <>In <span className={MONO}>{glance.bins.days}</span> days</>}</p>
          <p className={`mt-auto text-[17px] ${SOFT}`}>{glance.bins.label}</p>
        </Tile>
      ) : null}
      {fam && showBabyTaps(glance) ? (
        <Tile span="col-span-2" label="Baby log" testId="wall-tile-baby">
          <h2 style={FACE} className={`${BODY} text-[20px] font-medium`}>Baby log</h2>
          {fam.baby_line ? <p className="text-[20px]">{fam.baby_line}</p> : null}
          <div className="mt-auto flex gap-3" role="group" aria-label="Baby log">
            {(["feed", "nappy", "sleep"] as const).map((k) => (
              <button key={k} type="button" onClick={() => onBaby(k)} className="min-h-[56px] flex-1 rounded-[10px] border border-[color:var(--fg-line)] px-4 text-[20px] capitalize active:bg-[var(--fg-paper-3)]">
                {k}
              </button>
            ))}
          </div>
        </Tile>
      ) : null}
    </div>
  );
}
