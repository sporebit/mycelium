"use client";

/**
 * /phirstmaxx/things (spec §8): everything dropped in, researched. Filters
 * for fits-this-week, indoor, dog-friendly, distance from home and cost, a
 * search box, a map of the placed ones, and the newest drops with where
 * their research stands. `?drop=` (from Telegram or the share page) puts
 * that drop first.
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { DropBox } from "./DropBox";
import { DropLine } from "./Home";
import { INPUT, STATUS_WORDS, VERDICT_CLASS, VERDICT_WORDS, durationLabel, pounds, type DropWithThing, type ThingCard } from "./api";

const ThingsMap = dynamic(() => import("./ThingsMap").then((m) => m.ThingsMap), { ssr: false, loading: () => <p className="text-sm text-text-lo">Loading the map…</p> });

type ThingsView = { things: ThingCard[]; people: Array<{ id: string; name: string }>; me: string };
type Filters = { fits: boolean; indoor: "" | "1" | "0"; dog: boolean; max_km: string; max_cost: string; q: string; archived: boolean };
const NONE: Filters = { fits: false, indoor: "", dog: false, max_km: "", max_cost: "", q: "", archived: false };

function query(f: Filters): string {
  const sp = new URLSearchParams();
  if (f.fits) sp.set("fits", "week");
  if (f.indoor) sp.set("indoor", f.indoor);
  if (f.dog) sp.set("dog", "yes");
  if (f.max_km) sp.set("max_km", f.max_km);
  if (f.max_cost) sp.set("max_cost", f.max_cost);
  if (f.q.trim()) sp.set("q", f.q.trim());
  if (f.archived) sp.set("archived", "1");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function ThingCardView({ t }: { t: ThingCard }) {
  return (
    <li>
      <Link href={`/phirstmaxx/things/${t.id}`} className="flex gap-3 rounded-v2-md border border-hairline bg-surface-0 p-3 hover:bg-surface-2" data-testid="pm-thing-card">
        {t.has_image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link from our own route; next/image cannot optimise it
          <img src={`/api/phirstmaxx/things/${t.id}/image`} alt="" className="h-16 w-16 flex-none rounded-v2-sm object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="truncate text-sm text-text-hi">{t.name}</span>
            <span className="text-xs text-text-lo">{t.kind ?? STATUS_WORDS[t.status] ?? ""}</span>
          </div>
          {t.summary ? <p className="mt-0.5 line-clamp-2 text-xs text-text-mid">{t.summary}</p> : null}
          <p className="mt-1 text-xs text-text-lo">
            {[
              t.from_home ? `${t.from_home.minutes} min by car${t.from_home.provider === "estimate" ? " (estimate)" : ""}` : null,
              t.min_minutes ? `about ${durationLabel(t.min_minutes)}${t.max_minutes ? `–${durationLabel(t.max_minutes)}` : ""} there` : null,
              t.cost_pence !== null ? pounds(t.cost_pence) : null,
              t.indoor === true ? "indoors" : t.indoor === false ? "outdoors" : null,
              t.dog_rule === "yes" ? "dogs welcome" : t.dog_rule === "outside_only" ? "dogs outside" : t.dog_rule === "no" ? "no dogs" : null,
            ]
              .filter(Boolean)
              .join(" · ") || (t.status === "researching" ? "Researching…" : "Nothing found yet")}
          </p>
          {t.fit ? <p className={`mt-1 text-xs ${VERDICT_CLASS[t.fit.verdict]}`}>{VERDICT_WORDS[t.fit.verdict]} this week · {t.fit.reason}</p> : null}
        </div>
      </Link>
    </li>
  );
}

export function Things({ highlightDrop }: { highlightDrop: string | null }) {
  const [f, setF] = useState<Filters>(NONE);
  const [showMap, setShowMap] = useState(false);
  const { data, error, mutate } = useApi<ThingsView>(`/api/phirstmaxx/things${query(f)}`);
  const drops = useApi<{ drops: DropWithThing[] }>("/api/phirstmaxx/drops?limit=12", { refreshInterval: highlightDrop ? 5000 : 0 });
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const dropList = useMemo(() => {
    const list = drops.data?.drops ?? [];
    if (!highlightDrop) return list;
    return [...list.filter((d) => d.id === highlightDrop), ...list.filter((d) => d.id !== highlightDrop)];
  }, [drops.data, highlightDrop]);

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <Surface className="p-5" data-testid="pm-things">
        <p className="text-sm text-text-mid">{status === 404 ? "PhirstMaxx lives in the family space. Set that up first, under Family." : "Things could not be loaded. Reload to try again."}</p>
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="pm-things">
      <Surface className="flex flex-col gap-3 p-4">
        <DropBox compact onSaved={async () => Promise.all([drops.mutate(), mutate()])} />
        {dropList.length > 0 ? (
          <ul className="divide-y divide-hairline" data-testid="pm-drops">
            {dropList.slice(0, highlightDrop ? 6 : 4).map((d) => (
              <DropLine key={d.id} d={d} />
            ))}
          </ul>
        ) : null}
      </Surface>

      <Surface className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          <input className={`${INPUT} min-w-[10rem] flex-1`} placeholder="Search" aria-label="Search things" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <Button size="sm" aria-pressed={f.fits} className={f.fits ? "border-glow text-glow-2" : ""} onClick={() => set("fits", !f.fits)}>
            Fits this week
          </Button>
          <Button size="sm" aria-pressed={f.dog} className={f.dog ? "border-glow text-glow-2" : ""} onClick={() => set("dog", !f.dog)}>
            Dog-friendly
          </Button>
          <select className={INPUT} aria-label="Indoors or outdoors" value={f.indoor} onChange={(e) => set("indoor", e.target.value as Filters["indoor"])}>
            <option value="">Indoors or out</option>
            <option value="1">Indoors</option>
            <option value="0">Outdoors</option>
          </select>
          <select className={INPUT} aria-label="Distance from home" value={f.max_km} onChange={(e) => set("max_km", e.target.value)}>
            <option value="">Any distance</option>
            <option value="15">Within 15 km</option>
            <option value="40">Within 40 km</option>
            <option value="80">Within 80 km</option>
            <option value="150">Within 150 km</option>
          </select>
          <select className={INPUT} aria-label="Cost" value={f.max_cost} onChange={(e) => set("max_cost", e.target.value)}>
            <option value="">Any cost</option>
            <option value="0">Free</option>
            <option value="10">Up to £10</option>
            <option value="25">Up to £25</option>
            <option value="50">Up to £50</option>
          </select>
          <Button size="sm" aria-pressed={f.archived} onClick={() => set("archived", !f.archived)}>
            {f.archived ? "Showing archived" : "Archived"}
          </Button>
          <Button size="sm" aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Hide map" : "Map"}
          </Button>
        </div>
        {showMap && data ? data.things.some((t) => t.lat !== null) ? <ThingsMap things={data.things} /> : <p className="text-sm text-text-lo">Nothing here has a position yet.</p> : null}
        {!data ? (
          <p className="text-sm text-text-lo">Loading…</p>
        ) : data.things.length === 0 ? (
          <p className="text-sm text-text-mid">{f === NONE || query(f) === "" ? "Nothing dropped in yet. Paste a link above." : "Nothing matches those filters."}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="pm-things-list">
            {data.things.map((t) => (
              <ThingCardView key={t.id} t={t} />
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
