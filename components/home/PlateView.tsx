"use client";

/**
 * Specimen plate (claude/ui-direction.md): the day as a field-guide page.
 * The win is a large annotated specimen (a: what it is, b: first step, c:
 * time, d: where it grows); the rest of today are smaller figures that can
 * be brought to the centre; done colours a specimen in. The week's
 * finished count is a spore print; hours are a ruler; captures waiting are
 * loose spores.
 *
 * It draws the Home data contract and nothing else, and acts through the
 * daily-loop routes the phone's focus card uses. Desktop first; on a phone
 * Home is the single next-thing card instead.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { playChime } from "@/components/daily/chime";
import type { HomeData, HomeItem } from "@/lib/home/contract";
import { seeded, speciesFor } from "@/lib/home/specimen";
import { about } from "@/lib/daily/words";
import { Network, type NetworkHandle } from "./Network";
import { Specimen } from "./Specimen";

const SERIF = "font-[family-name:var(--font-plate)]";
const MONO = "font-[family-name:var(--font-mono)]";
/** The plate's own palette: ink on dark paper. Home only; working pages keep the app's tokens. */
const INK = "#ece6d2";
const SOFT = "#cdc7b2";
const PAPER = "#181a16";

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;

/** The spore print: one ray per thing finished this week (at least a faint ring of them), seeded so it does not flicker. */
function sporeRays(count: number, seed: number): Array<{ d: string; op: number; sw: number }> {
  const r = seeded(seed);
  const total = 60;
  const lit = Math.min(total, count * 3);
  return Array.from({ length: total }, (_, i) => {
    const a = (i / total) * Math.PI * 2 + (r() - 0.5) * 0.05;
    const inner = 14 + r() * 6;
    const outer = (i < lit ? 70 : 34) + r() * (i < lit ? 40 : 18);
    const x1 = 120 + Math.cos(a) * inner;
    const y1 = 120 + Math.sin(a) * inner;
    const x2 = 120 + Math.cos(a) * outer;
    const y2 = 120 + Math.sin(a) * outer;
    return { d: `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`, op: i < lit ? 0.7 : 0.22, sw: i < lit ? 1.6 : 1 };
  });
}

export function PlateView({ data, chime = true }: { data: HomeData; chime?: boolean }) {
  const [items, setItems] = useState<HomeItem[]>(data.items);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState(data.week.count);
  const [lifetime, setLifetime] = useState(data.lifetime.count);
  const network = useRef<NetworkHandle | null>(null);

  const shown = items.filter((i) => !gone.has(i.item_id));
  // The centre: the one picked, else the first not yet done, else the last finished (so a won day still shows its specimen).
  const main = shown.find((i) => i.item_id === picked) ?? shown.find((i) => i.state !== "done") ?? shown[shown.length - 1] ?? null;
  const rest = shown.filter((i) => i.item_id !== main?.item_id);
  const won = shown.some((i) => i.is_win && i.state === "done");
  const rays = useMemo(() => sporeRays(weekCount, data.who.id.length * 7919 + 77), [weekCount, data.who.id]);

  const act = useCallback(
    async (item: HomeItem, action: "done" | "not_now") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/daily/items/${item.item_id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        if (!res.ok) throw new Error("not saved");
        if (action === "done") {
          setItems((list) => list.map((i) => (i.item_id === item.item_id ? { ...i, state: "done" } : i)));
          setWeekCount((n) => n + 1);
          setLifetime((n) => n + 1);
          // The moment: colour floods in (the fill transition), new growth from the specimen, a chime.
          network.current?.burst(0.5, 0.42);
          if (chime) playChime(item.is_win);
          // Stay on it: the finished specimen holds the centre, coloured in, until another figure is chosen.
          setPicked(item.item_id);
        } else {
          setGone((s) => new Set(s).add(item.item_id));
          setPicked(null);
        }
      } catch {
        setError("That did not save. Nothing was changed; try again.");
      } finally {
        setBusy(false);
      }
    },
    [chime],
  );

  const density = Math.min(1, 0.25 + lifetime / 400);
  const hours = data.hours;

  return (
    <div className="plate relative isolate min-h-[calc(100vh-76px)] overflow-hidden rounded-[6px]" style={{ background: PAPER, color: INK }} data-testid="home-plate">
      <Network ref={network} seed={data.who.id.length * 131 + 77} density={density} className="absolute inset-0 -z-10 h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-[4px]" style={{ boxShadow: `0 0 0 1px rgba(236,230,210,0.36), 0 0 0 5px ${PAPER}, 0 0 0 6px rgba(236,230,210,0.16)` }} />

      <div className="relative mx-auto flex max-w-[1380px] flex-col gap-6 px-10 pb-10 pt-8 [text-shadow:0_0_8px_#181a16,0_0_2px_#181a16]">
        <header className="text-center">
          <h1 className={`${SERIF} text-[40px] font-medium leading-[1.05] tracking-[-0.01em]`}>{data.day_label}</h1>
          <p className="mt-1" style={{ color: SOFT }}>
            {data.who.name === "You" ? "Your" : `${data.who.name}'s`} plate for the day, drawn at <span className={MONO} style={{ color: INK }}>{data.drawn_at}</span>
          </p>
        </header>

        <div className="grid grid-cols-[minmax(220px,262px)_minmax(0,1fr)_minmax(240px,306px)] gap-8">
          {/* Left margin: around today */}
          <aside aria-label="Around today" className="flex flex-col gap-6">
            {hours ? (
              <div className="plate-settle flex flex-col gap-1.5" data-testid="plate-hours">
                <div className={`${SERIF} text-[20px]`}>Hours this week</div>
                <svg role="img" aria-label={`${hm(hours.banked)} of ${hm(hours.target)} banked`} viewBox="0 0 262 30" className="h-[30px] w-full">
                  <rect x="1" y="6" width="260" height="16" fill="none" stroke={INK} strokeOpacity="0.6" />
                  <rect x="1" y="6" width={Math.max(0, Math.min(260, (hours.banked / hours.target) * 260))} height="16" fill={INK} fillOpacity="0.82" />
                  <path d={Array.from({ length: 9 }, (_, i) => `M${(i + 1) * 26} 22v${i % 2 ? 4 : 7}`).join("")} stroke={INK} strokeOpacity="0.6" strokeWidth="1" />
                </svg>
                <div>
                  <span className={`${MONO} text-[22px] tabular-nums`}>{hm(hours.left)}</span> <span style={{ color: SOFT }}>{hours.note}</span>
                </div>
              </div>
            ) : null}

            <div className="plate-settle flex flex-col gap-1" data-testid="plate-spores">
              <div className={`${SERIF} text-[20px]`}>Loose spores</div>
              {data.captures_waiting > 0 ? (
                <p>
                  <span className={`${MONO} tabular-nums`}>{data.captures_waiting}</span>{" "}
                  <span style={{ color: SOFT }}>{data.captures_waiting === 1 ? "capture" : "captures"}, sorted at tonight&apos;s close.</span>
                </p>
              ) : (
                <p style={{ color: SOFT }}>None waiting.</p>
              )}
              <Link href="/close" className="inline-flex min-h-[44px] items-center underline underline-offset-4">
                Close the day
              </Link>
            </div>

            {data.quiet.length ? (
              <div className="plate-settle flex flex-col gap-1" data-testid="plate-quiet">
                <div className={`${SERIF} text-[20px]`}>Gone quiet</div>
                <ul className="flex flex-col">
                  {data.quiet.slice(0, 4).map((q) => (
                    <li key={q.href}>
                      <Link href={q.href} className="flex min-h-[32px] items-baseline justify-between gap-3 hover:underline">
                        <span>{q.label}</span>
                        <span className="text-[13px]" style={{ color: SOFT }}>
                          {q.how_long}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          {/* Centre: the specimen */}
          <main className="flex min-w-0 flex-col items-center gap-4">
            {main ? (
              <>
                <div className="grid w-full max-w-[700px] grid-cols-[1fr_minmax(200px,250px)_1fr] items-center gap-4">
                  <div className={`${SERIF} flex flex-col gap-20 text-right text-[18px]`}>
                    <p>a. {main.is_win ? "The day's win" : "If there is time"}</p>
                    <p style={{ color: SOFT }}>d. Grows under {main.section ?? "no section yet"}</p>
                  </div>
                  <div className="aspect-[300/440] w-full" key={main.item_id}>
                    <Specimen species={speciesFor(main.section, main.seed)} seed={main.seed} done={main.state === "done"} title={`Specimen for ${main.title}`} />
                  </div>
                  <div className={`${SERIF} flex flex-col gap-20 text-[18px]`}>
                    <p className="[text-wrap:pretty]">b. First step: {main.first_step}</p>
                    <p>
                      c. <span className={`${MONO} text-[15px] tabular-nums`}>{about(main.minutes)}</span>
                    </p>
                  </div>
                </div>
                <h2 className={`${SERIF} max-w-[640px] text-center text-[32px] font-medium leading-[1.1] [text-wrap:balance]`} data-testid="plate-title">
                  {main.title}
                </h2>
                {main.state === "done" ? (
                  <p className={`${SERIF} text-[19px]`} style={{ color: "#dfe8cf" }} role="status" data-testid="plate-collected">
                    {main.is_win || won ? "Collected and coloured in. The day is won." : "Collected and coloured in."}
                  </p>
                ) : (
                  <div className="flex gap-2.5 [text-shadow:none]">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(main, "done")}
                      className="plate-press min-h-[48px] rounded-[10px] px-6 text-[16px] font-bold disabled:opacity-60"
                      style={{ background: INK, color: "#1c1e18" }}
                    >
                      Done — colour it in
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(main, "not_now")}
                      className="plate-press min-h-[48px] rounded-[10px] px-4 disabled:opacity-60"
                      style={{ background: PAPER, color: INK, boxShadow: "0 0 0 1px rgba(236,230,210,0.34)" }}
                    >
                      Not now
                    </button>
                    <Link href="/today" className="plate-press inline-flex min-h-[48px] items-center rounded-[10px] px-4 underline underline-offset-4">
                      Start with a timer
                    </Link>
                  </div>
                )}
                {error ? (
                  <p role="alert" className="text-[15px]" style={{ color: "#f0b8a8" }}>
                    {error}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center" data-testid="plate-empty">
                <h2 className={`${SERIF} text-[32px] font-medium`}>A blank plate.</h2>
                <p style={{ color: SOFT }}>Nothing is lined up for today. Capture something, or line one thing up from Work.</p>
              </div>
            )}

            {rest.length ? (
              <section aria-label="The rest of today" className="mt-2 grid w-full max-w-[700px] grid-cols-2 gap-3 [text-shadow:none]">
                {rest.slice(0, 8).map((f, n) => (
                  <button
                    key={f.item_id}
                    type="button"
                    onClick={() => setPicked(f.item_id)}
                    className="plate-press plate-settle flex min-h-[104px] items-center gap-3 rounded-[10px] py-1.5 pl-2 pr-3 text-left"
                    style={{ background: "rgba(27,29,24,0.92)", color: INK, boxShadow: "0 0 0 1px rgba(236,230,210,0.2)", animationDelay: `${n * 80}ms` }}
                    data-testid="plate-figure"
                  >
                    <Specimen species={speciesFor(f.section, f.seed)} seed={f.seed} done={f.state === "done"} size="small" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={`${MONO} whitespace-nowrap text-[12px] tabular-nums`} style={{ color: SOFT }}>
                        {f.state === "done" ? "collected" : about(f.minutes)}
                      </span>
                      <span className={`${SERIF} text-[17px] leading-[1.15]`}>{f.short}</span>
                    </span>
                  </button>
                ))}
              </section>
            ) : null}
            {rest.length > 8 ? (
              <p className="text-[14px]" style={{ color: SOFT }}>
                and {rest.length - 8} more on <Link href="/today" className="underline underline-offset-4">Today</Link>
              </p>
            ) : null}
          </main>

          {/* Right margin: collected so far */}
          <aside aria-label="Collected so far" className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2">
              <svg role="img" aria-label={`Spore print: ${weekCount} finished this week`} viewBox="0 0 240 240" className="h-[230px] w-[230px]">
                <circle cx="120" cy="120" r="114" fill={PAPER} fillOpacity="0.7" stroke={INK} strokeOpacity="0.22" strokeWidth="1" />
                {rays.map((r, i) => (
                  <path key={i} className="plate-ink" pathLength={1} d={r.d} stroke={INK} strokeOpacity={r.op} strokeWidth={r.sw} strokeLinecap="round" fill="none" style={{ animationDelay: `${i * 18}ms` }} />
                ))}
                <circle cx="120" cy="120" r="9" fill={PAPER} stroke={INK} strokeOpacity="0.55" strokeWidth="1" />
              </svg>
              <p className={`${SERIF} text-center text-[19px]`} data-testid="plate-print">
                Spore print. <span className={`${MONO} text-[16px] tabular-nums`}>{weekCount}</span> collected this week
                {data.lifetime.since ? (
                  <>
                    , <span className={`${MONO} text-[16px] tabular-nums`}>{lifetime}</span> since {data.lifetime.since}
                  </>
                ) : null}
                .
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className={`${SERIF} text-[19px]`}>The week so far</div>
              <div className="flex gap-1.5">
                {data.week.days.map((d) => {
                  const done = d.done + (d.is_today ? weekCount - data.week.count : 0);
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={d.is_future ? undefined : `${done} finished`}>
                      <svg aria-hidden="true" viewBox="0 0 100 100" className="h-[30px] w-[30px]">
                        <circle cx="50" cy="50" r="44" fill={done > 0 ? INK : "none"} fillOpacity={done > 0 ? Math.min(0.9, 0.35 + done * 0.15) : 0} stroke={INK} strokeOpacity={d.is_future ? 0.25 : 0.6} strokeWidth="4" />
                        {d.is_today ? <circle cx="50" cy="50" r="10" fill={done > 0 ? PAPER : INK} /> : null}
                      </svg>
                      <span className="text-[12.5px]" style={{ color: d.is_today ? INK : SOFT }}>
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Link href="/finish" className="inline-flex min-h-[44px] items-center underline underline-offset-4">
              Finish line: nearly done
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
