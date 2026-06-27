"use client";
// DRAFT: Three distinct data models not yet decided. Design/Video may overlap with Projects in Compost.

import { useState } from "react";

type StudioTab = "music" | "footage" | "design";

type MusicProject = {
  id: string;
  name: string;
  status: "idea" | "in-progress" | "mixing" | "done";
  genre: string;
  bpm: number;
};

type FootageItem = {
  id: string;
  filename: string;
  date: string;
  durationSecs: number;
  tags: string[];
  location: string;
};

type DesignProject = {
  id: string;
  name: string;
  type: string;
  status: "backlog" | "in-progress" | "review" | "done";
  deadline: string | null;
};

const SAMPLE_MUSIC: MusicProject[] = [
  { id: "m1", name: "Late Night Drift", status: "in-progress", genre: "Lo-fi", bpm: 82 },
  { id: "m2", name: "Signal Loss", status: "mixing", genre: "Ambient", bpm: 70 },
  { id: "m3", name: "Iron Gate", status: "idea", genre: "Drum & Bass", bpm: 174 },
  { id: "m4", name: "Soft Landing", status: "done", genre: "Downtempo", bpm: 95 },
];

const SAMPLE_FOOTAGE: FootageItem[] = [
  { id: "f1", filename: "drone_coast_001.mp4", date: "2026-05-20", durationSecs: 245, tags: ["drone", "landscape"], location: "Pembrokeshire" },
  { id: "f2", filename: "interview_raw_take2.mov", date: "2026-05-15", durationSecs: 1820, tags: ["interview", "a-cam"], location: "Studio" },
  { id: "f3", filename: "timelapse_sunset.mp4", date: "2026-04-28", durationSecs: 30, tags: ["timelapse", "golden-hour"], location: "Bristol" },
  { id: "f4", filename: "bts_session_may.mp4", date: "2026-05-22", durationSecs: 480, tags: ["behind-the-scenes"], location: "Studio" },
];

const SAMPLE_DESIGN: DesignProject[] = [
  { id: "d1", name: "Album Cover - Signal Loss", type: "Graphic Design", status: "in-progress", deadline: "2026-06-15" },
  { id: "d2", name: "Myphelium2 Promo Video", type: "Video", status: "backlog", deadline: null },
  { id: "d3", name: "Brand Guidelines v2", type: "Design System", status: "review", deadline: "2026-06-10" },
  { id: "d4", name: "Live Session Edit", type: "Video", status: "done", deadline: null },
];

function musicStatusClass(s: MusicProject["status"]): string {
  switch (s) {
    case "idea": return "border-ink-2 text-ink-3 bg-ink-0";
    case "in-progress": return "border-accent/40 text-accent bg-accent/10";
    case "mixing": return "border-warn/40 text-warn bg-warn/10";
    case "done": return "border-ok/40 text-ok bg-ok/10";
  }
}

function designStatusClass(s: DesignProject["status"]): string {
  switch (s) {
    case "backlog": return "border-ink-2 text-ink-3 bg-ink-0";
    case "in-progress": return "border-accent/40 text-accent bg-accent/10";
    case "review": return "border-warn/40 text-warn bg-warn/10";
    case "done": return "border-ok/40 text-ok bg-ok/10";
  }
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(d: string): string {
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

export function StudioClient() {
  const [tab, setTab] = useState<StudioTab>("music");

  return (
    <div className="flex flex-col gap-6 max-w-[1000px]">
      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Studio
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          Music, footage, and design projects.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "music", label: "Music" },
            { key: "footage", label: "Footage" },
            { key: "design", label: "Design / Video" },
          ] as { key: StudioTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase transition-colors ${
              tab === t.key
                ? "bg-accent/15 border border-accent/50 text-accent"
                : "border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "music" && <MusicTab />}
      {tab === "footage" && <FootageTab />}
      {tab === "design" && <DesignTab />}
    </div>
  );
}

function MusicTab() {
  const [projects] = useState(SAMPLE_MUSIC);
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
        Music Projects
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink-4 font-medium">{p.name}</span>
              <span
                className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${musicStatusClass(p.status)}`}
              >
                {p.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span>{p.genre}</span>
              <span className="font-[family-name:var(--font-mono)] tabular-nums">{p.bpm} BPM</span>
            </div>
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              Stem links placeholder
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FootageTab() {
  const [items] = useState(SAMPLE_FOOTAGE);
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
        Media Catalogue
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ink-2">
              {["Filename", "Date", "Duration", "Tags", "Location"].map((h) => (
                <th
                  key={h}
                  className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-left p-2 font-normal"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-b border-ink-2/50">
                <td className="p-2 text-ink-4 font-[family-name:var(--font-mono)] text-xs">
                  {f.filename}
                </td>
                <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-3 text-xs">
                  {formatDate(f.date)}
                </td>
                <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-3">
                  {formatDuration(f.durationSecs)}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {f.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ink-2 text-ink-3"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-2 text-ink-3 text-xs">{f.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DesignTab() {
  const [projects] = useState(SAMPLE_DESIGN);
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
        Design / Video Projects
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ink-2">
              {["Project", "Type", "Status", "Deadline"].map((h) => (
                <th
                  key={h}
                  className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-left p-2 font-normal"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-ink-2/50">
                <td className="p-2 text-ink-4 font-medium">{p.name}</td>
                <td className="p-2 text-ink-3 text-xs">{p.type}</td>
                <td className="p-2">
                  <span
                    className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${designStatusClass(p.status)}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="p-2 font-[family-name:var(--font-mono)] tabular-nums text-ink-3 text-xs">
                  {p.deadline ? formatDate(p.deadline) : <span className="text-ink-3/50">--</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
