"use client";

/**
 * Home in the Field shell (docs/run/2026-11-28/field-guide-design.md §6):
 * a plain tile grid, six columns, with today the largest tile. It draws the
 * Home data contract and nothing else, except the Guides tile, which asks
 * /api/guides for itself because the contract (shared with the wall) does
 * not carry guides. Done and Not now go through the same handlers as
 * Specimen plate (useHomeDay); Start opens Today's timer as the plate does.
 *
 * Flat on purpose: paper-2 tiles on paper, one hairline, radius 10, no
 * shadow, no illustration, no network. Headings in the Field body face;
 * every number in mono. Desktop only: on a phone Home is the single
 * next-thing card (app/page.tsx).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { useApi } from "@/lib/data/useApi";
import { about } from "@/lib/daily/words";
import type { HomeData, HomeItem } from "@/lib/home/contract";
import { greeting, hourOf, londonHour } from "@/lib/home/greeting";
import { useHomeDay } from "./useHomeDay";

const BODY = "font-[family-name:var(--fg-font-body)]";
const MONO = "font-[family-name:var(--fg-font-mono)] tabular-nums";
const INK = "text-[color:var(--fg-ink)]";
const SOFT = "text-[color:var(--fg-ink-soft)]";
/** Moss for words and the Done button: the Field shell maps --glow to a moss a step darker on light paper, so small text holds 4.5:1. */
const MOSS = "text-[color:var(--glow)]";
/** The global h1..h6 rule sits outside the utility layer and would win over a class; the Field face is set inline. */
const FACE = { fontFamily: "var(--fg-font-body)" } as const;

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;

/** One tile: its span on the six-column grid, a heading, and what goes in it. */
function Tile({ span, label, testId, children, className = "" }: { span: string; label: string; testId: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} data-testid={testId} className={`field-tile flex min-w-0 flex-col gap-3 rounded-[10px] border border-[color:var(--fg-line)] bg-[var(--fg-paper-2)] p-5 ${INK} ${span} ${className}`}>
      {children}
    </section>
  );
}

function TileHeading({ children }: { children: ReactNode }) {
  return <h2 style={FACE} className={`${BODY} text-[19px] font-medium leading-tight tracking-[-0.005em] ${INK}`}>{children}</h2>;
}

const STATE_WORD: Record<HomeItem["state"], string> = { open: "to do", started: "started", done: "done" };

type Day = ReturnType<typeof useHomeDay>;

function TodayTile({ data, day }: { data: HomeData; day: Day }) {
  const { shown, picked, setPicked, busy, error, act } = day;
  // The win holds the tile: the one picked, else the first not done, else the last finished (a won day still shows it).
  const main = shown.find((i) => i.item_id === picked) ?? shown.find((i) => i.state !== "done") ?? shown[shown.length - 1] ?? null;
  const rest = shown.filter((i) => i.item_id !== main?.item_id);
  const won = shown.some((i) => i.is_win && i.state === "done");
  const hour = hourOf(data.drawn_at) ?? londonHour(new Date());

  return (
    <Tile span="col-span-4 row-span-2" label="Today" testId="tile-today" className="gap-5 p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 style={FACE} className={`${BODY} text-[34px] font-medium leading-[1.1] tracking-[-0.01em] ${INK}`} data-testid="tiles-greeting">
          {greeting(hour, data.who.name)}
        </h1>
        <p className={SOFT}>
          {data.day_label}, drawn at <span className={`${MONO} ${INK}`}>{data.drawn_at}</span>
        </p>
      </header>

      {main ? (
        <div className="flex flex-col gap-3" data-testid="tiles-main">
          <p className={`text-[13px] font-semibold uppercase tracking-[0.06em] ${main.state === "done" ? MOSS : SOFT}`}>{main.is_win ? "The day's one thing" : "If there is time"}</p>
          <h2 style={{ ...FACE, color: main.state === "done" ? "var(--glow)" : "var(--fg-ink)" }} className={`${BODY} field-flip max-w-[38ch] text-[30px] font-medium leading-[1.15] [text-wrap:balance] ${main.state === "done" ? MOSS : INK}`} data-testid="tiles-title">
            {main.title}
          </h2>
          <p className={`${BODY} max-w-[60ch] text-[18px] leading-snug [text-wrap:pretty]`}>
            <span className={SOFT}>First step: </span>
            {main.first_step}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-4">
            <span className={`${MONO} text-[16px]`}>{about(main.minutes)}</span>
            {main.section ? <span className={SOFT}>{main.section}</span> : null}
          </p>
          {main.state === "done" ? (
            <p role="status" className={`${BODY} text-[19px] text-[color:var(--glow)]`} data-testid="tiles-done">
              {main.is_win || won ? "Done. The day is won." : "Done."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(main, "done")}
                className="field-press min-h-[48px] rounded-[10px] bg-[var(--glow)] px-6 text-[16px] font-semibold text-[color:var(--fg-paper)] disabled:opacity-60"
              >
                Done
              </button>
              <Link href="/today" className={`field-press inline-flex min-h-[48px] items-center rounded-[10px] border border-[color:var(--fg-line)] px-5 text-[16px] ${INK}`}>
                Start with a timer
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(main, "not_now")}
                className={`field-press min-h-[48px] rounded-[10px] px-4 text-[16px] underline underline-offset-4 disabled:opacity-60 ${SOFT}`}
              >
                Not now
              </button>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-[15px] text-[color:var(--fg-umber)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1" data-testid="tiles-empty">
          <h2 style={FACE} className={`${BODY} text-[26px] font-medium ${INK}`}>Nothing lined up for today.</h2>
          <p className={SOFT}>Capture something, or line one thing up from Work.</p>
        </div>
      )}

      {rest.length ? (
        <div className="mt-auto flex flex-col gap-1 border-t border-[color:var(--fg-line)] pt-4">
          <h3 style={FACE} className={`${BODY} text-[17px] font-medium ${INK}`}>The rest of today</h3>
          <ul className="flex flex-col" data-testid="tiles-rest">
            {rest.slice(0, 6).map((r) => (
              <li key={r.item_id}>
                <button type="button" onClick={() => setPicked(r.item_id)} className="-mx-1 flex min-h-[44px] w-[calc(100%+0.5rem)] items-baseline justify-between gap-4 rounded-[6px] px-1 text-left hover:bg-[var(--fg-paper-3)]">
                  <span className={`${BODY} min-w-0 truncate text-[17px] ${r.state === "done" ? MOSS : INK}`}>{r.title}</span>
                  <span className="flex shrink-0 items-baseline gap-3 text-[14px]">
                    <span className={r.state === "done" ? MOSS : SOFT}>{STATE_WORD[r.state]}</span>
                    <span className={`${MONO} ${SOFT}`}>{r.minutes} min</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rest.length > 6 ? (
            <p className={`text-[14px] ${SOFT}`}>
              and <span className={MONO}>{rest.length - 6}</span> more on{" "}
              <Link href="/today" className="underline underline-offset-4">
                Today
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </Tile>
  );
}

function WeekTile({ data, weekCount, lifetime }: { data: HomeData; weekCount: number; lifetime: number }) {
  return (
    <Tile span="col-span-2" label="This week" testId="tile-week">
      <TileHeading>This week</TileHeading>
      <div className="flex gap-1.5" aria-hidden="true">
        {data.week.days.map((d) => {
          // A Done on this page lands on today's cell straight away.
          const done = d.done + (d.is_today ? weekCount - data.week.count : 0);
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`field-flip h-7 w-full rounded-[4px] border ${d.is_today ? "border-[color:var(--fg-ink-soft)]" : "border-[color:var(--fg-line)]"}`}
                style={{ background: d.is_future ? "transparent" : done > 0 ? `color-mix(in srgb, var(--fg-moss) ${Math.min(90, 35 + done * 15)}%, transparent)` : "var(--fg-paper-3)" }}
              />
              <span className={`text-[12px] ${d.is_today ? INK : SOFT}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
      <p>
        <span className={`${MONO} text-[22px]`}>{weekCount}</span> <span className={SOFT}>finished this week</span>
      </p>
      {data.lifetime.since ? (
        <p className={`text-[14px] ${SOFT}`}>
          <span className={MONO}>{lifetime}</span> since {data.lifetime.since}
        </p>
      ) : null}
    </Tile>
  );
}

function HoursTile({ hours }: { hours: NonNullable<HomeData["hours"]> }) {
  const pct = hours.target > 0 ? Math.max(0, Math.min(1, hours.banked / hours.target)) : 0;
  return (
    <Tile span="col-span-2" label="Hours this week" testId="tile-hours">
      <TileHeading>Hours this week</TileHeading>
      <svg role="img" aria-label={`${hm(hours.banked)} of ${hm(hours.target)} banked`} viewBox="0 0 262 26" className="h-[26px] w-full" preserveAspectRatio="none">
        <rect x="0.5" y="4.5" width="261" height="14" rx="3" fill="var(--fg-paper-3)" stroke="var(--fg-line)" />
        <rect x="0.5" y="4.5" width={Math.max(0, pct * 261)} height="14" rx="3" fill="var(--fg-moss)" />
        <path d={Array.from({ length: 9 }, (_, i) => `M${(i + 1) * 26.1} 19v${i % 2 ? 3 : 6}`).join("")} stroke="var(--fg-ink-soft)" strokeWidth="1" />
      </svg>
      <p>
        <span className={`${MONO} text-[22px]`}>{hm(hours.banked)}</span> <span className={SOFT}>of</span> <span className={MONO}>{hm(hours.target)}</span>
      </p>
      <p className={`text-[14px] ${SOFT}`}>{hours.note}</p>
    </Tile>
  );
}

type GuideRow = { key: string; title: string; project_key: string | null; pct: number; done: number; total: number; resume: string | null; minutes_left: number | null; updated_at: string };

/** Guides in progress, from lane U1's /api/guides. Draws nothing at all when the call fails or there are none. */
function GuidesTile() {
  const { data, error } = useApi<{ guides: GuideRow[] }>("/api/guides", { shouldRetryOnError: false, revalidateOnFocus: false });
  const guides = (error ? [] : (data?.guides ?? [])).filter((g) => g.total > 0 && g.done < g.total).slice(0, 3);
  if (!guides.length) return null;
  return (
    <Tile span="col-span-2" label="Guides in progress" testId="tile-guides">
      <TileHeading>Guides in progress</TileHeading>
      <ul className="flex flex-col gap-3">
        {guides.map((g) => {
          const pct = Math.max(0, Math.min(100, Math.round(g.pct)));
          return (
            <li key={g.key}>
              <Link href={`/guides/${encodeURIComponent(g.key)}`} className="flex flex-col gap-1 rounded-[6px] hover:bg-[var(--fg-paper-3)]">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`${BODY} min-w-0 truncate text-[17px] ${INK}`}>{g.title}</span>
                  <span className={`${MONO} shrink-0 text-[14px]`}>{pct}%</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 100 4" preserveAspectRatio="none" className="h-[4px] w-full">
                  <rect x="0" y="1.25" width="100" height="1.5" fill="var(--fg-line)" />
                  <rect x="0" y="0.5" width={pct} height="3" rx="1.5" fill="var(--fg-moss)" />
                </svg>
                {g.resume || g.minutes_left != null ? (
                  <span className={`text-[13.5px] ${SOFT}`}>
                    {g.resume}
                    {g.resume && g.minutes_left != null ? " · " : null}
                    {g.minutes_left != null ? (
                      <>
                        about <span className={MONO}>{g.minutes_left}</span> min left
                      </>
                    ) : null}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

function CapturesTile({ count, wide }: { count: number; wide: boolean }) {
  return (
    <Tile span={wide ? "col-span-2" : "col-span-1"} label="Captures waiting" testId="tile-captures">
      <TileHeading>Captures</TileHeading>
      {count > 0 ? (
        <p>
          <span className={`${MONO} text-[22px]`}>{count}</span> <span className={SOFT}>waiting for tonight&apos;s close</span>
        </p>
      ) : (
        <p className={SOFT}>None waiting.</p>
      )}
      <Link href="/close" className="mt-auto inline-flex min-h-[44px] items-center underline underline-offset-4">
        Close the day
      </Link>
    </Tile>
  );
}

function NudgesTile({ notes, onNotToday }: { notes: HomeData["nudges"]; onNotToday: (id: string) => void }) {
  return (
    <Tile span="col-span-2" label="Nudges" testId="tile-nudges">
      <TileHeading>Nudges</TileHeading>
      <ul className="flex flex-col gap-3">
        {notes.slice(0, 3).map((n) => (
          <li key={n.id} className="flex flex-col gap-1.5">
            <p className="[text-wrap:pretty]">
              <span className={SOFT}>{n.from}, </span>
              <span className={`${MONO} text-[14px] ${SOFT}`}>{n.at}</span>
              <span className={SOFT}>: </span>
              {n.text}
            </p>
            <button type="button" onClick={() => onNotToday(n.id)} className={`field-press min-h-[44px] self-start rounded-[8px] border border-[color:var(--fg-line)] px-3.5 ${INK}`}>
              Not today
            </button>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function QuietTile({ quiet }: { quiet: HomeData["quiet"] }) {
  return (
    <Tile span="col-span-2" label="Gone quiet" testId="tile-quiet">
      <TileHeading>Gone quiet</TileHeading>
      <ul className="flex flex-col">
        {quiet.slice(0, 4).map((q) => (
          <li key={q.href}>
            <Link href={q.href} className="flex min-h-[40px] items-baseline justify-between gap-3 hover:underline">
              <span>{q.label}</span>
              <span className={`text-[14px] ${SOFT}`}>quiet for {q.how_long}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

export function TilesView({ data, chime = true }: { data: HomeData; chime?: boolean }) {
  // One day state for every tile, so a Done moves the week's count as well as the Today tile.
  const day = useHomeDay(data, { chime });
  return (
    <div className="field-tiles mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-6" data-testid="home-tiles">
      <div className="grid grid-flow-row-dense grid-cols-6 gap-4">
        <TodayTile data={data} day={day} />
        <WeekTile data={data} weekCount={day.weekCount} lifetime={day.lifetime} />
        {data.hours ? <HoursTile hours={data.hours} /> : null}
        <GuidesTile />
        {/* With no Hours tile beside Today, Captures takes its two columns so the grid has no hole. */}
        <CapturesTile count={data.captures_waiting} wide={!data.hours} />
        {day.notes.length ? <NudgesTile notes={day.notes} onNotToday={(id) => void day.notToday(id)} /> : null}
        {data.quiet.length ? <QuietTile quiet={data.quiet} /> : null}
      </div>
    </div>
  );
}
