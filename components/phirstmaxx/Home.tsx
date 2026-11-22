"use client";

/**
 * PhirstMaxx Home (spec §8): the next window the two of them are free, in
 * words; what is on this week; proposals waiting for an answer, with Yes,
 * No and Another time; the newest drops and what research made of them;
 * the research status line; and the drop box.
 */
import { useState } from "react";
import Link from "next/link";
import { Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { DropBox } from "./DropBox";
import { PlanCard } from "./PlanCard";
import { ResearchLine } from "./ResearchLine";
import { STATUS_WORDS, ago, errText, send, spanLabel, windowInWords, type DropWithThing, type HomeData } from "./api";

export function DropLine({ d }: { d: DropWithThing }) {
  const failed = d.research.filter((r) => r.status === "failed");
  const running = d.research.some((r) => r.status === "queued" || r.status === "running");
  const what = d.thing?.name ?? d.url ?? d.text?.split("\n")[0] ?? (d.media_paths.length ? "A picture" : "A drop");
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-text-hi">
        {d.thing ? (
          <Link href={`/phirstmaxx/things/${d.thing.id}`} className="hover:underline">
            {what}
          </Link>
        ) : (
          what
        )}
      </span>
      <span className="text-xs text-text-lo">
        {d.thing ? STATUS_WORDS[d.thing.status] ?? d.thing.status : running ? "Researching" : failed.length ? "Research stumbled; it will try again" : d.question && !d.answer ? "Waiting for an answer" : "Waiting"} · {ago(d.received_at)}
      </span>
    </li>
  );
}

export function Home() {
  const { data, error, mutate } = useApi<HomeData>("/api/phirstmaxx/home");
  const [fail, setFail] = useState<string | null>(null);

  async function respond(id: string, answer: "yes" | "no" | "another_time") {
    setFail(null);
    try {
      await send("POST", `/api/phirstmaxx/plans/${id}`, { action: "respond", answer });
      await mutate();
    } catch (e) {
      setFail(errText(e));
    }
  }

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <Surface className="p-5" data-testid="pm-home">
        <h1 className="text-lg text-text-hi">PhirstMaxx</h1>
        <p className="mt-2 text-sm text-text-mid">
          {status === 404 ? (
            <>
              PhirstMaxx lives in the family space. <Link href="/family" className="text-glow-2 hover:underline">Set that up first</Link>, then come back.
            </>
          ) : (
            "This could not be loaded. Reload to try again."
          )}
        </p>
      </Surface>
    );
  }
  if (!data) return <p className="text-sm text-text-lo">Loading…</p>;
  const other = data.people.find((p) => p.id !== data.me);

  return (
    <div className="flex flex-col gap-4" data-testid="pm-home">
      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-next-window">
        <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi">{data.next_window ? "Next time together" : "No time together yet"}</h1>
        {data.next_window ? (
          <p className="text-base text-text-hi">{windowInWords(data.next_window)}</p>
        ) : (
          <p className="text-sm text-text-mid">
            Paint both of your weeks on the <Link href="/phirstmaxx/week" className="text-glow-2 hover:underline">grid</Link> and the windows appear here.
          </p>
        )}
        <p className="text-xs text-text-lo">
          {data.windows_this_week === 0 ? "No firm windows in the next seven days." : `${data.windows_this_week} firm ${data.windows_this_week === 1 ? "window" : "windows"} in the next seven days.`}{" "}
          <Link href="/phirstmaxx/week" className="text-glow-2 hover:underline">
            Week
          </Link>
        </p>
      </Surface>

      <Surface className="flex flex-col gap-3 p-5">
        <h2 className="text-base text-text-hi">Drop something in</h2>
        <DropBox onSaved={() => mutate()} />
      </Surface>

      {data.waiting_for_me.length > 0 ? (
        <Surface className="flex flex-col gap-3 p-5" data-testid="pm-waiting">
          <h2 className="text-base text-text-hi">Waiting for you</h2>
          <ul className="flex flex-col gap-3">
            {data.waiting_for_me.map((p) => (
              <PlanCard key={p.id} plan={p} people={data.people} me={data.me} onRespond={(a) => respond(p.id, a)} />
            ))}
          </ul>
        </Surface>
      ) : null}

      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-on-this-week">
        <h2 className="text-base text-text-hi">On this week</h2>
        {data.on_this_week.length === 0 ? (
          <p className="text-sm text-text-mid">
            Nothing agreed yet. {other ? `Propose something to ${other.name} from a thing, or ` : "Propose something from a thing, or "}
            <Link href="/phirstmaxx/plans" className="text-glow-2 hover:underline">
              hold a window
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.on_this_week.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm">
                <Link href={p.thing_id ? `/phirstmaxx/things/${p.thing_id}` : "/phirstmaxx/plans"} className="text-text-hi hover:underline">
                  {p.title}
                </Link>
                <span className="text-text-lo">{spanLabel(p.starts_at, p.ends_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-newest">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base text-text-hi">Newest drops</h2>
          <Link href="/phirstmaxx/things" className="text-xs text-glow-2 hover:underline">
            All things
          </Link>
        </div>
        {data.drops.length === 0 ? <p className="text-sm text-text-mid">Nothing dropped in yet.</p> : (
          <ul className="divide-y divide-hairline">
            {data.drops.map((d) => (
              <DropLine key={d.id} d={d} />
            ))}
          </ul>
        )}
        <ResearchLine research={data.research} />
      </Surface>

      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </div>
  );
}
