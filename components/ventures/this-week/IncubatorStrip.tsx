"use client";

import Link from "next/link";
import { Surface, Label } from "@/components/ui";
import type { Venture } from "@/lib/ventures/types";

export function IncubatorStrip({
  ideas,
  expanded,
  onToggle,
}: {
  ideas: Venture[];
  expanded: boolean;
  onToggle: (v: boolean) => void;
}) {
  if (ideas.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        className="flex items-center gap-2 mb-2 px-1 group"
      >
        <Label>Incubator · {ideas.length}</Label>
        <span
          aria-hidden
          className={`text-text-lo group-hover:text-text-hi transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      {expanded && (
        <div className="-mx-4 sm:-mx-6 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-stretch gap-3 px-4 sm:px-6 snap-x snap-mandatory">
            {ideas.map((v) => (
              <Link
                key={v.id}
                href={`/ventures/${v.id}`}
                className="snap-start"
              >
                <Surface
                  level={1}
                  interactive
                  className="p-3 w-[160px] shrink-0 min-h-[72px]"
                >
                  <div
                    className="w-2 h-2 rounded-full mb-2"
                    style={{ backgroundColor: v.accent_colour }}
                  />
                  <div className="text-sm text-text-hi truncate">{v.name}</div>
                  {v.tagline && (
                    <div className="text-[11px] text-text-lo truncate mt-0.5">
                      {v.tagline}
                    </div>
                  )}
                </Surface>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
