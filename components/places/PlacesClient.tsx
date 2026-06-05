"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Mono } from "@/components/dashboard/Mono";

const PlacesMap = dynamic(() => import("./PlacesMap").then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] rounded-lg border border-ink-2 bg-ink-1 flex items-center justify-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
      Loading map…
    </div>
  ),
});

export type Place = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  google_maps_url: string | null;
  rating: number | null;
  visit_date: string | null;
  notes: string | null;
  tags: string[];
};

const CATEGORIES = [
  "hike",
  "restaurant",
  "pub",
  "cafe",
  "viewpoint",
  "campsite",
  "attraction",
  "place",
] as const;

const STATUSES = ["wishlist", "planned", "visited"] as const;

const STATUS_COLORS: Record<string, string> = {
  wishlist: "text-ink-3",
  planned: "text-warn",
  visited: "text-ok",
};

// Armthorpe DN3 approximate coords
const HOME_LAT = 53.5349;
const HOME_LNG = -1.0537;

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function PlacesClient() {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/places")
      .then((r) => r.json())
      .then((j: { places?: Place[] }) => {
        if (!cancelled) setPlaces(j.places ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  const filtered = useMemo(() => {
    if (!places) return [];
    if (filter === "all") return places;
    return places.filter((p) => p.status === filter);
  }, [places, filter]);

  const mappable = useMemo(
    () => filtered.filter((p) => p.lat != null && p.lng != null),
    [filtered],
  );

  async function addPlace(form: {
    name: string;
    category: string;
    status: string;
    description: string;
    address: string;
    google_maps_url: string;
    lat: string;
    lng: string;
  }) {
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lat: form.lat ? parseFloat(form.lat) : null,
          lng: form.lng ? parseFloat(form.lng) : null,
        }),
      });
      if (!res.ok) {
        setError("Failed to add");
        return;
      }
      const { place } = (await res.json()) as { place: Place };
      setPlaces((prev) => (prev ? [place, ...prev] : [place]));
      setShowAdd(false);
    } catch {
      setError("Network error");
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const body: Record<string, unknown> = { status };
      if (status === "visited") {
        body.visit_date = new Date().toISOString().split("T")[0];
      }
      const res = await fetch(`/api/places/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Failed to update");
        return;
      }
      const { place } = (await res.json()) as { place: Place };
      setPlaces(
        (prev) => prev?.map((p) => (p.id === id ? place : p)) ?? null,
      );
    } catch {
      setError("Network error");
    }
  }

  async function deletePlace(id: string) {
    try {
      const res = await fetch(`/api/places/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to delete");
        return;
      }
      setPlaces((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch {
      setError("Network error");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Places
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Hikes, spots, and places to visit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors shrink-0"
        >
          {showAdd ? "CANCEL" : "+ ADD"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {showAdd && <AddForm onSubmit={addPlace} />}

      {/* Map */}
      {mappable.length > 0 && <PlacesMap places={mappable} />}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["all", ...STATUSES] as const).map((s) => {
          const count =
            s === "all"
              ? places?.length ?? 0
              : places?.filter((p) => p.status === s).length ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
                filter === s
                  ? "bg-accent/15 border border-accent/40 text-accent"
                  : "border border-ink-2 text-ink-3 hover:text-ink-4"
              }`}
            >
              {s.toUpperCase()} ({count})
            </button>
          );
        })}
      </div>

      {/* Place list */}
      {places === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-6 text-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          {filter === "all"
            ? "No places yet. Tap + ADD to start your list."
            : `No ${filter} places.`}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              onUpdateStatus={updateStatus}
              onDelete={deletePlace}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaceRow({
  place: p,
  onUpdateStatus,
  onDelete,
}: {
  place: Place;
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const distance =
    p.lat != null && p.lng != null
      ? haversineMiles(HOME_LAT, HOME_LNG, p.lat, p.lng)
      : null;

  const statusClass = STATUS_COLORS[p.status] ?? "text-ink-3";
  const nextStatus =
    p.status === "wishlist"
      ? "planned"
      : p.status === "planned"
        ? "visited"
        : null;

  return (
    <li className="rounded-md bg-ink-1 border border-ink-2 p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-4 font-medium truncate">
            {p.name}
          </span>
          <span
            className={`text-[10px] uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] shrink-0 ${statusClass}`}
          >
            {p.status}
          </span>
          <span className="text-[10px] text-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] shrink-0">
            {p.category}
          </span>
        </div>
        {p.description && (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5 line-clamp-2">
            {p.description}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {distance != null && (
            <Mono className="text-[10px] text-ink-3">
              {distance < 1
                ? `${(distance * 5280).toFixed(0)}ft`
                : `${distance.toFixed(1)}mi`}{" "}
              away
            </Mono>
          )}
          {p.rating != null && (
            <Mono className="text-[10px] text-ok">
              {"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}
            </Mono>
          )}
          {p.visit_date && (
            <Mono className="text-[10px] text-ink-3">
              Visited {formatDate(p.visit_date)}
            </Mono>
          )}
          {p.address && (
            <span className="text-[10px] text-ink-3 italic font-[family-name:var(--font-display)] truncate max-w-[200px]">
              {p.address}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {nextStatus && (
          <button
            type="button"
            onClick={() => onUpdateStatus(p.id, nextStatus)}
            className={`px-2 py-1 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] transition-colors ${
              nextStatus === "planned"
                ? "bg-warn/15 border border-warn/40 text-warn"
                : "bg-ok/15 border border-ok/40 text-ok"
            }`}
          >
            {nextStatus === "planned" ? "PLAN" : "VISITED"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(p.id)}
          title="Delete place"
          className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function AddForm({
  onSubmit,
}: {
  onSubmit: (f: {
    name: string;
    category: string;
    status: string;
    description: string;
    address: string;
    google_maps_url: string;
    lat: string;
    lng: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("place");
  const [status, setStatus] = useState("wishlist");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      category,
      status,
      description,
      address,
      google_maps_url: googleMapsUrl,
      lat,
      lng,
    });
  }

  const inputClass =
    "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
  const labelClass =
    "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md bg-ink-1 border border-ink-2 p-4 flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Roseberry Topping"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Google Maps URL</label>
          <input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            placeholder="Paste Google Maps link (auto-extracts coords)"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Latitude</label>
          <input
            type="text"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="53.5608"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Longitude</label>
          <input
            type="text"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-1.1099"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short climb with amazing views of the Cleveland Hills"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Newton under Roseberry, North Yorkshire"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={!name.trim()}
        className="self-start px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
      >
        ADD PLACE
      </button>
    </form>
  );
}
