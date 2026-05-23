"use client";

import type { Task } from "@/lib/types/task";
import { Mono } from "@/components/dashboard/Mono";
import { UrgencyPill, pillToneFor } from "./UrgencyPill";

function dueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayUTC = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const diffDays = Math.round((due.getTime() - todayUTC) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  if (diffDays === -1) return "due yesterday";
  if (diffDays > 0) return `due in ${diffDays}d`;
  return `${Math.abs(diffDays)}d overdue`;
}

function ownerInitials(owner: string | null): string {
  if (!owner) return "·";
  const parts = owner.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TaskCard({
  task,
  onClick,
  dragging = false,
  compact = false,
}: {
  task: Task;
  onClick?: () => void;
  dragging?: boolean;
  compact?: boolean;
}) {
  const tone = pillToneFor(task);
  const due = dueLabel(task.due_date);
  const tags = (task.tags ?? []).slice(0, 2);

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg border bg-ink-1/70 backdrop-blur-sm px-3 py-2.5 flex flex-col gap-2 cursor-pointer transition-colors ${
        dragging
          ? "border-accent/60 shadow-2xl shadow-accent/10"
          : "border-ink-2 hover:border-ink-3"
      } ${compact ? "py-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-ink-4 leading-snug min-w-0 break-words">
          {task.title}
        </div>
        <UrgencyPill tone={tone} />
      </div>

      {(tags.length > 0 || task.entity_name || due) && (
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
          <div className="flex items-center gap-1.5 min-w-0">
            {tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 truncate max-w-[80px]"
              >
                {t}
              </span>
            ))}
            {task.entity_name && (
              <span className="truncate">· {task.entity_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {due && <Mono className="text-ink-3">{due}</Mono>}
            <span
              className="h-5 w-5 rounded-full bg-ink-2 border border-ink-2 flex items-center justify-center text-[9px] text-ink-3 shrink-0"
              title={task.owner ?? ""}
            >
              {ownerInitials(task.owner)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
