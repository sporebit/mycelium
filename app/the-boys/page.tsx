"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";

type Agent = {
  id: string;
  display_name: string;
  tagline: string;
  accent_colour: string;
};

type AgentInfo = {
  agent: Agent;
  memory: string;
  memoryUpdatedAt: string | null;
};

const AGENT_IDS = ["da_boi", "fitness", "finance", "tasks", "nutrition"];

function fmtTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function TheBoysPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Map<string, AgentInfo>>(new Map());
  const [query, setQuery] = useState("");

  useEffect(() => {
    for (const id of AGENT_IDS) {
      fetch(`/api/agents/${id}`)
        .then((r) => r.json())
        .then((data: AgentInfo) => {
          setAgents((prev) => new Map(prev).set(id, data));
        })
        .catch(() => {});
    }
  }, []);

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/the-boys/da_boi?q=${encodeURIComponent(q)}`);
  }

  const daBoi = agents.get("da_boi");
  const others = AGENT_IDS.filter((id) => id !== "da_boi");

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          The Boys
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Your AI agents — each specialised, all sharing memory.
        </p>
      </header>

      {/* Da Boi — hero card */}
      <Link href="/the-boys/da_boi" className="block group">
        <div
          className="rounded-2xl border-2 p-6 transition-colors hover:border-opacity-80"
          style={{ borderColor: "#5de8e0", backgroundColor: "rgba(93, 232, 224, 0.05)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl text-text-0 font-[family-name:var(--font-display)] italic">
                {daBoi?.agent.display_name ?? "Da Boi"}
              </h2>
              <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
                {daBoi?.agent.tagline ?? "Knows everything. Says it straight."}
              </p>
              <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] mt-3 line-clamp-2">
                {daBoi?.memory
                  ? daBoi.memory.slice(0, 100) + (daBoi.memory.length > 100 ? "…" : "")
                  : "No memory yet"}
              </p>
              <Mono className="text-[10px] text-ink-3 mt-2">
                Memory updated {fmtTime(daBoi?.memoryUpdatedAt ?? null)}
              </Mono>
            </div>
            <div
              className="shrink-0 px-4 py-2 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase border transition-colors group-hover:bg-opacity-25"
              style={{
                color: "#5de8e0",
                borderColor: "rgba(93, 232, 224, 0.4)",
                backgroundColor: "rgba(93, 232, 224, 0.15)",
              }}
            >
              TALK TO DA BOI
            </div>
          </div>
        </div>
      </Link>

      {/* Individual agents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {others.map((id) => {
          const info = agents.get(id);
          const colour = info?.agent.accent_colour ?? "var(--ink-3)";
          return (
            <Link key={id} href={`/the-boys/${id}`} className="block group">
              <Panel className="h-full">
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                  style={{ backgroundColor: colour }}
                />
                <div className="flex flex-col gap-2">
                  <h3 className="text-base text-ink-4">
                    {info?.agent.display_name ?? id}
                  </h3>
                  <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                    {info?.agent.tagline ?? ""}
                  </p>
                  <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] line-clamp-2">
                    {info?.memory
                      ? info.memory.slice(0, 100) + (info.memory.length > 100 ? "…" : "")
                      : "No memory yet"}
                  </p>
                  <Mono className="text-[10px] text-ink-3">
                    Memory updated {fmtTime(info?.memoryUpdatedAt ?? null)}
                  </Mono>
                  <div
                    className="self-start mt-1 px-3 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase border transition-colors"
                    style={{
                      color: colour,
                      borderColor: `${colour}66`,
                      backgroundColor: `${colour}26`,
                    }}
                  >
                    TALK
                  </div>
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>

      {/* Ask input */}
      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything across all of Mycelium…"
          className="flex-1 bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2.5 outline-none focus:border-ink-3 placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          ASK
        </button>
      </form>
    </div>
  );
}
