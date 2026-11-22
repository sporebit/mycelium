"use client";

/**
 * /phirstmaxx/things/[id] (spec §8): the full research for one thing.
 * Every fact with its source line ("from the official site ·
 * nationaltrust.org.uk · checked 3 Nov"), travel per person per mode with
 * the provider, the fit list and "next fits: …", Propose from a fit,
 * Re-research, and the hand-edit fields research never overwrites.
 */
import { useState } from "react";
import Link from "next/link";
import { Button, Label, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { FitResult } from "@/lib/phirstmaxx/types";
import { INPUT, SOURCE_WORDS, STATUS_WORDS, VERDICT_CLASS, VERDICT_WORDS, dateLabel, durationLabel, errText, factText, hostOf, pounds, send, spanLabel, timeLabel, type Person, type ThingDetail as Detail } from "./api";

type View = Detail & { people: Person[]; me: string };
const DOG_WORDS: Record<string, string> = { yes: "Dogs welcome", no: "No dogs", outside_only: "Dogs outside only", unknown: "Dogs: unknown" };

export function ThingDetail({ id }: { id: string }) {
  const { data, error, mutate } = useApi<View>(`/api/phirstmaxx/things/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");

  async function act(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setFail(null);
    setNotice(null);
    try {
      await fn();
      await mutate();
      if (done) setNotice(done);
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <Surface className="p-5" data-testid="pm-thing">
        <p className="text-sm text-text-mid">{status === 404 ? "No such thing." : "This could not be loaded. Reload to try again."}</p>
        <Link href="/phirstmaxx/things" className="text-sm text-glow-2 hover:underline">
          All things
        </Link>
      </Surface>
    );
  }
  if (!data) return <p className="text-sm text-text-lo" data-testid="pm-thing">Loading…</p>;
  const t = data.thing;
  const name = (pid: string | null) => (pid === null ? "Shared" : data.people.find((p) => p.id === pid)?.name ?? "Someone");
  const myStars = t.stars?.[data.me] ?? 0;
  const propose = (fit: FitResult) =>
    act("propose", () => send("POST", `/api/phirstmaxx/things/${id}`, { action: "propose", starts_at: new Date(fit.arrive_at ?? fit.window.start).toISOString(), ends_at: new Date(fit.leave_at ?? fit.window.end).toISOString() }), "Proposed. The other of you will be asked.");

  return (
    <div className="flex flex-col gap-4" data-testid="pm-thing">
      <Surface className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-text-lo">
              <Link href="/phirstmaxx/things" className="hover:underline">
                Things
              </Link>{" "}
              · {STATUS_WORDS[t.status] ?? t.status}
              {t.last_researched_at ? ` · researched ${dateLabel(t.last_researched_at)}` : ""}
            </p>
            <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi">{t.name}</h1>
            {t.address ? <p className="text-sm text-text-mid">{t.address}</p> : null}
          </div>
          {t.has_image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link from our own route
            <img src={`/api/phirstmaxx/things/${id}/image`} alt="" className="h-24 w-24 flex-none rounded-v2-md object-cover" />
          ) : null}
        </div>
        {t.summary ? <p className="text-sm text-text-hi">{t.summary}</p> : null}
        <p className="text-sm text-text-mid">
          {[
            t.kind,
            t.min_minutes ? `about ${durationLabel(t.min_minutes)}${t.max_minutes ? `–${durationLabel(t.max_minutes)}` : ""} there` : null,
            t.cost_pence !== null ? `${pounds(t.cost_pence)} per adult` : null,
            t.indoor === true ? "indoors" : t.indoor === false ? "outdoors" : null,
            DOG_WORDS[t.dog_rule],
            t.from_home ? `${t.from_home.minutes} min by car from home (${t.from_home.provider})` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-lo">Your stars</span>
          {[0, 1, 2, 3].map((n) => (
            <Button key={n} size="sm" aria-pressed={myStars === n} className={myStars === n ? "border-glow text-glow-2" : ""} disabled={busy !== null} onClick={() => void act("stars", () => send("PATCH", `/api/phirstmaxx/things/${id}`, { stars: n }))}>
              {n === 0 ? "None" : "★".repeat(n)}
            </Button>
          ))}
          <span className="flex-1" />
          <Button size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? "Close edits" : "Edit by hand"}
          </Button>
          <Button size="sm" loading={busy === "rerun"} disabled={busy !== null} onClick={() => void act("rerun", () => send("POST", `/api/phirstmaxx/things/${id}`, { action: "rerun" }), "Research queued again.")}>
            Re-research
          </Button>
          <Button size="sm" loading={busy === "archive"} disabled={busy !== null} onClick={() => void act("archive", () => send("POST", `/api/phirstmaxx/things/${id}`, { action: t.status === "archived" ? "unarchive" : "archive" }))}>
            {t.status === "archived" ? "Unarchive" : "Archive"}
          </Button>
        </div>
        {editing ? <HandEdit id={id} thing={t} onSaved={() => mutate()} /> : null}
        {data.question ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-v2-md border border-hairline bg-surface-0 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const drop = data.drops.find((d) => d.question && !d.answer);
              if (!drop || !answer.trim()) return;
              void act("answer", () => send("POST", "/api/phirstmaxx/questions", { drop_id: drop.id, answer: answer.trim() }), "Thank you. Research carries on from that.");
            }}
          >
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <Label>Research asks: {data.question}</Label>
              <input className={INPUT} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </label>
            <Button type="submit" size="sm" variant="primary" loading={busy === "answer"} disabled={busy !== null || !answer.trim()}>
              Answer
            </Button>
          </form>
        ) : null}
        {notice ? <p role="status" className="text-sm text-glow-2">{notice}</p> : null}
        {fail ? (
          <p role="alert" className="text-sm text-v2-error">
            {fail}
          </p>
        ) : null}
      </Surface>

      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-thing-fits">
        <h2 className="text-base text-text-hi">When it fits</h2>
        {data.next ? <p className="text-sm text-glow-2">{data.next.text}</p> : <p className="text-sm text-text-mid">{data.fits.length === 0 ? "No together-windows in the next eight weeks to try it in. Paint both weeks on the grid." : "It does not fit a window in the next eight weeks."}</p>}
        {data.fits.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {data.fits.slice(0, 12).map((f, i) => (
              <li key={`${f.window.start}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span className="text-text-hi">{spanLabel(f.window.start, f.window.end)}</span>
                <span className={`text-xs ${VERDICT_CLASS[f.verdict]}`}>
                  {VERDICT_WORDS[f.verdict]} · {f.reason}
                  {f.verdict !== "no" && f.legs.length ? ` · leave by ${timeLabel(Math.min(...f.legs.map((l) => l.leave_at)))}` : ""}
                </span>
                {f.verdict !== "no" ? (
                  <Button size="sm" variant="primary" loading={busy === "propose"} disabled={busy !== null} onClick={() => void propose(f)}>
                    Propose
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>

      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-thing-travel">
        <h2 className="text-base text-text-hi">Getting there</h2>
        {data.travel.length === 0 ? (
          <p className="text-sm text-text-mid">No travel times yet. They are fetched once the place is known and a start point is saved in Settings.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-lo">
                <th className="py-1 font-normal">From</th>
                <th className="py-1 font-normal">How</th>
                <th className="py-1 font-normal">Time</th>
                <th className="py-1 font-normal">Distance</th>
                <th className="py-1 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.travel.map((l) => (
                <tr key={l.id} className="border-t border-hairline text-text-hi">
                  <td className="py-1">
                    {l.place_label} <span className="text-xs text-text-lo">({name(l.person_id)})</span>
                  </td>
                  <td className="py-1">{l.mode}</td>
                  <td className="py-1">{durationLabel(l.minutes)}</td>
                  <td className="py-1">{l.km !== null ? `${l.km.toFixed(0)} km` : "—"}</td>
                  <td className="py-1 text-xs text-text-lo">
                    {l.provider} · {dateLabel(l.fetched_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-thing-facts">
        <h2 className="text-base text-text-hi">What research found</h2>
        {Object.keys(data.facts).length === 0 ? (
          <p className="text-sm text-text-mid">{t.status === "researching" ? "Researching. Facts appear here as each stage finishes." : "Nothing yet. Re-research, or fill in what you know by hand."}</p>
        ) : (
          <dl className="flex flex-col gap-2">
            {Object.entries(data.facts).map(([key, facts]) => (
              <div key={key} className="border-t border-hairline pt-2 first:border-t-0 first:pt-0">
                <dt className="text-xs uppercase tracking-[0.08em] text-text-lo">{key.replace(/_/g, " ")}</dt>
                {facts.map((f) => (
                  <dd key={f.id} className="mt-0.5">
                    <p className="text-sm text-text-hi">{factText(f.value)}</p>
                    <p className="text-xs text-text-lo">
                      from {SOURCE_WORDS[f.source_kind] ?? f.source_kind}
                      {hostOf(f.source_url) ? (
                        <>
                          {" · "}
                          <a href={f.source_url!} target="_blank" rel="noreferrer" className="hover:underline">
                            {hostOf(f.source_url)}
                          </a>
                        </>
                      ) : null}
                      {" · "}checked {dateLabel(f.checked_at)}
                      {f.source_kind === "estimate" ? " · estimate" : ""}
                      {f.edited_by_user ? " · by hand" : ""}
                      {f.confidence < 0.5 && !f.edited_by_user ? " · low confidence" : ""}
                    </p>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        )}
      </Surface>

      {data.drops.length > 0 ? (
        <Surface className="flex flex-col gap-2 p-5">
          <h2 className="text-base text-text-hi">Dropped in as</h2>
          <ul className="divide-y divide-hairline text-sm">
            {data.drops.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-text-hi">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {d.url}
                    </a>
                  ) : (
                    d.text?.split("\n")[0] ?? "A picture"
                  )}
                </span>
                <span className="text-xs text-text-lo">
                  {d.source} · {name(d.person_id)} · {dateLabel(d.received_at)}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </div>
  );
}

function HandEdit({ id, thing, onSaved }: { id: string; thing: View["thing"]; onSaved: () => Promise<unknown> }) {
  const [v, setV] = useState({
    name: thing.name,
    kind: thing.kind ?? "",
    min_minutes: thing.min_minutes?.toString() ?? "",
    max_minutes: thing.max_minutes?.toString() ?? "",
    indoor: thing.indoor === null ? "" : thing.indoor ? "1" : "0",
    dog_rule: thing.dog_rule,
    cost: thing.cost_pence === null ? "" : (thing.cost_pence / 100).toString(),
    summary: thing.summary ?? "",
    address: thing.address ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const edited = new Set(thing.hand_edited ?? []);
  const mark = (k: string) => (edited.has(k) ? <span className="ml-1 text-text-lo">· by hand</span> : null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  return (
    <form
      className="grid gap-3 rounded-v2-md border border-hairline bg-surface-0 p-3 sm:grid-cols-2"
      data-testid="pm-hand-edit"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setFail(null);
        const cost = num(v.cost);
        void send("PATCH", `/api/phirstmaxx/things/${id}`, {
          name: v.name,
          kind: v.kind.trim() || null,
          min_minutes: num(v.min_minutes),
          max_minutes: num(v.max_minutes),
          indoor: v.indoor === "" ? null : v.indoor === "1",
          dog_rule: v.dog_rule,
          cost_pence: cost === null ? null : Math.round(cost * 100),
          summary: v.summary.trim() || null,
          address: v.address.trim() || null,
        })
          .then(onSaved)
          .catch((err: unknown) => setFail(errText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <label className="flex flex-col gap-1 sm:col-span-2">
        <Label>Name{mark("name")}</Label>
        <input className={INPUT} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>What it is{mark("kind")}</Label>
        <input className={INPUT} placeholder="e.g. woodland walk" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>Address{mark("address")}</Label>
        <input className={INPUT} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>Shortest stay, minutes{mark("min_minutes")}</Label>
        <input className={INPUT} inputMode="numeric" value={v.min_minutes} onChange={(e) => setV({ ...v, min_minutes: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>Longest stay, minutes{mark("max_minutes")}</Label>
        <input className={INPUT} inputMode="numeric" value={v.max_minutes} onChange={(e) => setV({ ...v, max_minutes: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>Indoors{mark("indoor")}</Label>
        <select className={INPUT} value={v.indoor} onChange={(e) => setV({ ...v, indoor: e.target.value })}>
          <option value="">Unknown</option>
          <option value="1">Indoors</option>
          <option value="0">Outdoors</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>Dogs{mark("dog_rule")}</Label>
        <select className={INPUT} value={v.dog_rule} onChange={(e) => setV({ ...v, dog_rule: e.target.value as typeof v.dog_rule })}>
          {Object.entries(DOG_WORDS).map(([k, w]) => (
            <option key={k} value={k}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>Cost per adult, £{mark("cost_pence")}</Label>
        <input className={INPUT} inputMode="decimal" placeholder="0 for free" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <Label>Summary{mark("summary")}</Label>
        <textarea className={`${INPUT} min-h-[80px] py-2`} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" loading={busy} disabled={busy}>
          Save
        </Button>
        <span className="text-xs text-text-lo">What you set by hand is never overwritten by research.</span>
      </div>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error sm:col-span-2">
          {fail}
        </p>
      ) : null}
    </form>
  );
}
