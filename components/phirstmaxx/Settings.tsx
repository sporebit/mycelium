"use client";

/**
 * /phirstmaxx/settings (spec §8): you (name, colour, car, waking hours,
 * buffers, home), start points, block types, pets, "late one tonight", the
 * inbox link (its token shown once), the research status and, for the
 * instance owner, the research spend cap.
 */
import { useState } from "react";
import { Button, Label, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { ENGINE_KINDS, type PmBlockType, type PmPlace } from "@/lib/phirstmaxx/types";
import { ResearchLine } from "./ResearchLine";
import { CELL, INPUT, dayLabel, errText, send, type SettingsView } from "./api";

const KIND_WORDS: Record<string, string> = { work: "Work (no buffer)", shift: "Shift (buffer after)", walk: "Dog walk", sit: "Sit", busy: "Busy", free: "Free", faith: "Faith" };

function useAct(mutate: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const act = async (label: string, body: Record<string, unknown>, then?: (r: Record<string, unknown>) => void) => {
    setBusy(label);
    setFail(null);
    try {
      const r = await send<Record<string, unknown>>("POST", "/api/phirstmaxx/settings", body);
      await mutate();
      then?.(r);
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, fail, act };
}

export function Settings() {
  const { data, error, mutate } = useApi<SettingsView>("/api/phirstmaxx/settings", { revalidateOnFocus: false });
  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <Surface className="p-5" data-testid="pm-settings">
        <p className="text-sm text-text-mid">{status === 404 ? "PhirstMaxx lives in the family space. Set that up first, under Family." : "Settings could not be loaded. Reload to try again."}</p>
      </Surface>
    );
  }
  if (!data) return <p className="text-sm text-text-lo" data-testid="pm-settings">Loading…</p>;
  const refresh = () => mutate();
  return (
    <div className="flex flex-col gap-4" data-testid="pm-settings">
      <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi">PhirstMaxx settings</h1>
      <Me data={data} refresh={refresh} />
      <Places data={data} refresh={refresh} />
      <Types data={data} refresh={refresh} />
      <Pets data={data} refresh={refresh} />
      <LateTonight data={data} refresh={refresh} />
      <Inbox data={data} refresh={refresh} />
      <Surface className="flex flex-col gap-2 p-5" data-testid="pm-settings-research">
        <h2 className="text-base text-text-hi">Research</h2>
        <ResearchLine research={data.research} />
        {data.research ? (
          <ul className="text-xs text-text-lo">
            {Object.entries(data.research.last_ok_by_source).map(([k, v]) => (
              <li key={k}>
                {k}: {v ? `last ok ${dayLabel(v)}` : "never"}
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>
    </div>
  );
}

function Me({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const me = data.me;
  const [v, setV] = useState({
    name: me.name,
    colour: me.colour,
    has_car: me.has_car,
    weekday_start: me.waking.weekday.start,
    weekday_end: me.waking.weekday.end,
    weekend_start: me.waking.weekend.start,
    weekend_end: me.waking.weekend.end,
    shift: String(me.buffers.shift),
    sit: String(me.buffers.sit),
    walk: String(me.buffers.walk),
    home: me.home_place_id ?? "",
    cap: me.settings.research_cap_pence === null ? "" : (me.settings.research_cap_pence / 100).toString(),
  });
  const { busy, fail, act } = useAct(refresh);
  const myPlaces = data.places.filter((p) => p.person_id === me.id || p.person_id === null);
  return (
    <Surface as="form" className="flex flex-col gap-3 p-5" data-testid="pm-settings-me" onSubmit={(e: React.FormEvent) => {
      e.preventDefault();
      const body: Record<string, unknown> = {
        action: "person",
        name: v.name,
        colour: v.colour,
        has_car: v.has_car,
        waking: { weekday: { start: v.weekday_start, end: v.weekday_end }, weekend: { start: v.weekend_start, end: v.weekend_end } },
        buffers: { shift: Number(v.shift), sit: Number(v.sit), walk: Number(v.walk) },
        home_place_id: v.home || null,
      };
      if (me.is_owner) body.research_cap_pence = v.cap.trim() === "" ? null : Math.round(Number(v.cap) * 100);
      void act("me", body);
    }}>
      <h2 className="text-base text-text-hi">You</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <Label>Name</Label>
          <input className={INPUT} value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Colour</Label>
          <input type="color" className={`${INPUT} w-20`} value={v.colour} onChange={(e) => setV({ ...v, colour: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-text-hi">
          <input type="checkbox" checked={v.has_car} onChange={(e) => setV({ ...v, has_car: e.target.checked })} /> I have a car
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <Label>Weekday awake from</Label>
          <input type="time" className={INPUT} value={v.weekday_start} onChange={(e) => setV({ ...v, weekday_start: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>until</Label>
          <input type="time" className={INPUT} value={v.weekday_end} onChange={(e) => setV({ ...v, weekday_end: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Fri and Sat nights from</Label>
          <input type="time" className={INPUT} value={v.weekend_start} onChange={(e) => setV({ ...v, weekend_start: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>until</Label>
          <input type="time" className={INPUT} value={v.weekend_end} onChange={(e) => setV({ ...v, weekend_end: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-text-lo">An end at or before the start means the next day.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["shift", "sit", "walk"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <Label>After a {k}, minutes</Label>
            <input className={INPUT} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <Label>Home</Label>
          <select className={INPUT} value={v.home} onChange={(e) => setV({ ...v, home: e.target.value })}>
            <option value="">Not set</option>
            {myPlaces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {me.is_owner ? (
        <label className="flex max-w-xs flex-col gap-1">
          <Label>Research spend cap this month, £ (owner only)</Label>
          <input className={INPUT} inputMode="decimal" placeholder="Under the £5 AI cap when empty" value={v.cap} onChange={(e) => setV({ ...v, cap: e.target.value })} />
        </label>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={busy === "me"} disabled={busy !== null}>
          Save
        </Button>
      </div>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}

function Places({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const { busy, fail, act } = useAct(refresh);
  const [add, setAdd] = useState({ label: "", address: "", lat: "", lng: "", kind: "other", shared: false });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const who = (p: PmPlace) => (p.person_id === null ? "shared" : data.people.find((x) => x.id === p.person_id)?.name ?? "someone");
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="pm-settings-places">
      <h2 className="text-base text-text-hi">Start points</h2>
      <p className="text-xs text-text-lo">Where each of you sets off from: home, work, the other&rsquo;s house. Travel times are worked out from these.</p>
      {data.places.length > 0 ? (
        <table className="w-full text-sm">
          <tbody>
            {data.places.map((p) => (
              <tr key={p.id} className="border-t border-hairline">
                <td className="py-1">
                  <input className={CELL} defaultValue={p.label} aria-label={`Name of ${p.label}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.label && void act(p.id, { action: "place", id: p.id, label: e.target.value.trim() })} />
                </td>
                <td className="py-1">
                  <input className={CELL} defaultValue={p.address ?? ""} placeholder="Address" aria-label={`Address of ${p.label}`} onBlur={(e) => (e.target.value.trim() || null) !== p.address && void act(p.id, { action: "place", id: p.id, address: e.target.value.trim() || null })} />
                </td>
                <td className="py-1 text-xs text-text-lo">
                  {p.kind} · {who(p)}
                  {p.lat !== null && p.lng !== null ? ` · ${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}` : " · no position yet"}
                </td>
                <td className="py-1 text-right">
                  <Button size="sm" variant="danger" loading={busy === `del-${p.id}`} disabled={busy !== null} onClick={() => void act(`del-${p.id}`, { action: "delete_place", id: p.id })}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add-place", { action: "place", label: add.label, address: add.address || null, lat: num(add.lat), lng: num(add.lng), kind: add.kind, shared: add.shared }, () => setAdd({ label: "", address: "", lat: "", lng: "", kind: "other", shared: false }));
        }}
      >
        <input className={`${INPUT} min-w-[8rem]`} placeholder="Name, e.g. Home" aria-label="New place name" value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} />
        <input className={`${INPUT} min-w-[12rem] flex-1`} placeholder="Address" aria-label="New place address" value={add.address} onChange={(e) => setAdd({ ...add, address: e.target.value })} />
        <input className={`${INPUT} w-24`} placeholder="Lat" aria-label="Latitude" value={add.lat} onChange={(e) => setAdd({ ...add, lat: e.target.value })} />
        <input className={`${INPUT} w-24`} placeholder="Lng" aria-label="Longitude" value={add.lng} onChange={(e) => setAdd({ ...add, lng: e.target.value })} />
        <select className={INPUT} aria-label="Kind of place" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value })}>
          <option value="home">Home</option>
          <option value="work">Work</option>
          <option value="other">Other</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-text-mid">
          <input type="checkbox" checked={add.shared} onChange={(e) => setAdd({ ...add, shared: e.target.checked })} /> Shared
        </label>
        <Button type="submit" size="sm" variant="primary" loading={busy === "add-place"} disabled={busy !== null || !add.label.trim()}>
          Add
        </Button>
      </form>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}

function Types({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const { busy, fail, act } = useAct(refresh);
  const [add, setAdd] = useState({ name: "", engine_kind: "busy", colour: "#8a8a8a", default_firmness: "firm" });
  const row = (t: PmBlockType) => (
    <tr key={t.id} className="border-t border-hairline">
      <td className="py-1">
        <input className={CELL} defaultValue={t.name} aria-label={`Name of ${t.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && void act(t.id, { action: "type", id: t.id, name: e.target.value.trim() })} />
      </td>
      <td className="py-1">
        <select className={`${CELL}`} value={t.engine_kind} aria-label={`Engine kind of ${t.name}`} onChange={(e) => void act(t.id, { action: "type", id: t.id, engine_kind: e.target.value })}>
          {ENGINE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_WORDS[k]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1">
        <input type="color" className="h-8 w-12 rounded-v2-sm border border-hairline bg-transparent" value={t.colour ?? "#8a8a8a"} aria-label={`Colour of ${t.name}`} onChange={(e) => void act(t.id, { action: "type", id: t.id, colour: e.target.value })} />
      </td>
      <td className="py-1">
        <select className={CELL} value={t.default_firmness} aria-label={`Default firmness of ${t.name}`} onChange={(e) => void act(t.id, { action: "type", id: t.id, default_firmness: e.target.value })}>
          <option value="firm">Set in stone</option>
          <option value="flexible">Flexible</option>
        </select>
      </td>
      <td className="py-1 text-right">
        <Button size="sm" variant="danger" loading={busy === `del-${t.id}`} disabled={busy !== null} onClick={() => void act(`del-${t.id}`, { action: "delete_type", id: t.id })}>
          Remove
        </Button>
      </td>
    </tr>
  );
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="pm-settings-types">
      <h2 className="text-base text-text-hi">Block types</h2>
      <p className="text-xs text-text-lo">What a painted block can be. The engine kind decides how it counts: a shift has a buffer after it, free time is free, flexible blocks only soften a window.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-lo">
            <th className="py-1 font-normal">Name</th>
            <th className="py-1 font-normal">Counts as</th>
            <th className="py-1 font-normal">Colour</th>
            <th className="py-1 font-normal">Usually</th>
            <th />
          </tr>
        </thead>
        <tbody>{data.types.map(row)}</tbody>
      </table>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add-type", { action: "type", ...add }, () => setAdd({ name: "", engine_kind: "busy", colour: "#8a8a8a", default_firmness: "firm" }));
        }}
      >
        <input className={`${INPUT} min-w-[8rem]`} placeholder="New type" aria-label="New type name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
        <select className={INPUT} aria-label="New type counts as" value={add.engine_kind} onChange={(e) => setAdd({ ...add, engine_kind: e.target.value })}>
          {ENGINE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_WORDS[k]}
            </option>
          ))}
        </select>
        <input type="color" className="h-10 w-12 rounded-v2-md border border-hairline bg-transparent" aria-label="New type colour" value={add.colour} onChange={(e) => setAdd({ ...add, colour: e.target.value })} />
        <Button type="submit" size="sm" variant="primary" loading={busy === "add-type"} disabled={busy !== null || !add.name.trim()}>
          Add
        </Button>
      </form>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}

function Pets({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const { busy, fail, act } = useAct(refresh);
  const [name, setName] = useState("");
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="pm-settings-pets">
      <h2 className="text-base text-text-hi">Pets</h2>
      <p className="text-xs text-text-lo">A thing&rsquo;s dog rules are checked against these.</p>
      <ul className="flex flex-wrap gap-2">
        {data.pets.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-v2-md border border-hairline px-3 py-1 text-sm text-text-hi">
            {p.name} <span className="text-xs text-text-lo">{p.kind}</span>
            <button type="button" className="text-xs text-text-lo hover:text-v2-error" aria-label={`Remove ${p.name}`} disabled={busy !== null} onClick={() => void act(`del-${p.id}`, { action: "delete_pet", id: p.id })}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add-pet", { action: "pet", name, kind: "dog" }, () => setName(""));
        }}
      >
        <input className={INPUT} placeholder="Name" aria-label="New pet name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" variant="primary" loading={busy === "add-pet"} disabled={busy !== null || !name.trim()}>
          Add a dog
        </Button>
      </form>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}

function LateTonight({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const { busy, fail, act } = useAct(refresh);
  const [day, setDay] = useState("");
  const [end, setEnd] = useState("01:00");
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="pm-settings-late">
      <h2 className="text-base text-text-hi">Late one tonight</h2>
      <p className="text-xs text-text-lo">A later end to one day&rsquo;s waking hours, so the evening counts.</p>
      {data.waking_overrides.length > 0 ? (
        <ul className="text-sm">
          {data.waking_overrides.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 border-t border-hairline py-1 text-text-hi">
              <span>
                {dayLabel(`${w.day}T12:00:00Z`)} until {w.day_end} <span className="text-xs text-text-lo">({data.people.find((p) => p.id === w.person_id)?.name ?? "someone"})</span>
              </span>
              <Button size="sm" disabled={busy !== null} onClick={() => void act(`clear-${w.id}`, { action: "waking_override", day: w.day, person_id: w.person_id, day_end: null })}>
                Clear
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act("late", { action: "waking_override", day, day_end: end }, () => setDay(""));
        }}
      >
        <input type="date" className={INPUT} aria-label="Which night" value={day} onChange={(e) => setDay(e.target.value)} />
        <input type="time" className={INPUT} aria-label="Awake until" value={end} onChange={(e) => setEnd(e.target.value)} />
        <Button type="submit" size="sm" variant="primary" loading={busy === "late"} disabled={busy !== null || !day}>
          Set
        </Button>
      </form>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}

function Inbox({ data, refresh }: { data: SettingsView; refresh: () => Promise<unknown> }) {
  const { busy, fail, act } = useAct(refresh);
  const [token, setToken] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Surface className="flex flex-col gap-3 p-5" data-testid="pm-settings-inbox">
      <h2 className="text-base text-text-hi">Your inbox link</h2>
      <p className="text-xs text-text-lo">Anything that can POST can drop things in here: a link, words or a picture, with no sign-in. The token is shown once; a new one stops the old.</p>
      {token ? (
        <div className="rounded-v2-md border border-glow bg-surface-0 p-3">
          <p className="text-xs text-text-lo">Copy this now. It will not be shown again.</p>
          <code className="block break-all text-sm text-text-hi" data-testid="pm-inbox-token">
            {origin}/api/phirstmaxx/inbox/{token}
          </code>
        </div>
      ) : (
        <p className="text-sm text-text-mid">{data.inbox.hint ? `A token ending ${data.inbox.hint} is live.` : "No token yet."}</p>
      )}
      <div>
        <Button size="sm" loading={busy === "rotate"} disabled={busy !== null} onClick={() => void act("rotate", { action: "rotate_inbox_token" }, (r) => setToken(String(r.token ?? "")))}>
          {data.inbox.hint ? "Make a new token" : "Make a token"}
        </Button>
      </div>
      {fail ? (
        <p role="alert" className="text-sm text-v2-error">
          {fail}
        </p>
      ) : null}
    </Surface>
  );
}
