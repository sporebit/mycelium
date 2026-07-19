"use client";

import { useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

export function EditableField({
  label,
  value,
  onSave,
  multiline,
  type = "text",
}: {
  label: string;
  value: string | number | null;
  onSave: (val: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  function commit() {
    setEditing(false);
    if (draft !== String(value ?? "")) onSave(draft);
  }

  if (!editing) {
    return (
      <div className="group">
        <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
        <div
          onClick={() => {
            setDraft(String(value ?? ""));
            setEditing(true);
          }}
          className="text-sm text-text-1 cursor-pointer hover:text-text-0 min-h-[1.5rem] whitespace-pre-wrap"
        >
          {value || (
            <span className="text-ink-3 italic text-xs">Click to edit</span>
          )}
        </div>
      </div>
    );
  }

  if (multiline) {
    return (
      <div>
        <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={4}
          autoFocus
          className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent resize-y"
        />
      </div>
    );
  }

  return (
    <div>
      <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        autoFocus
        className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent"
      />
    </div>
  );
}
