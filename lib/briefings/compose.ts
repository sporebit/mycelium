import type { BriefingData } from "./data";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtTimeLondon(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return "ALL DAY";
  return `${fmtTimeLondon(start)}–${fmtTimeLondon(end)}`;
}

// Spec §18: HOT = overdue, WARM = a key ticket due within seven days.
function blockerTone(b: BriefingData["blockers"][number]): "HOT" | "WARM" {
  return b.isOverdue ? "HOT" : "WARM";
}

function fmtCurrencyShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "−";
  return `${sign}£${Math.round(abs).toLocaleString("en-GB")}`;
}

export function composeMessage(
  data: BriefingData,
  intro: string | null
): string {
  const sections: string[] = [];

  if (intro) {
    sections.push(`<i>${escHtml(intro)}</i>`);
  }

  // TODAY
  const todayLines: string[] = ["📅 <b>TODAY</b>"];
  if (data.calendar.length === 0) {
    todayLines.push("Nothing scheduled");
  } else {
    const shown = data.calendar.slice(0, 5);
    for (const e of shown) {
      todayLines.push(
        `• ${escHtml(fmtTimeRange(e.start, e.end, e.allDay))} ${escHtml(e.title)} <i>(${escHtml(e.calendarName)})</i>`
      );
    }
    if (data.calendar.length > 5) {
      todayLines.push(`+ ${data.calendar.length - 5} more`);
    }
  }
  sections.push(todayLines.join("\n"));

  // TOP TASKS — skip section entirely when empty
  if (data.topTasks.length > 0) {
    const lines = ["🎯 <b>TOP TASKS</b>"];
    for (const t of data.topTasks) {
      lines.push(`• ${escHtml(t.title)}`);
    }
    sections.push(lines.join("\n"));
  }

  // TICKETS (spec §8.2): scheduled today, overdue, Done awaiting verification — grouped by project
  const tk = data.tickets;
  if (tk && (tk.today.length > 0 || tk.overdue.length > 0 || tk.verify.length > 0)) {
    const lines = ["🎫 <b>TICKETS</b>"];
    const group = (label: string, rows: typeof tk.today) => {
      if (rows.length === 0) return;
      lines.push(`<i>${label}</i>`);
      const byProject = new Map<string, typeof rows>();
      for (const t of rows) {
        const p = t.project_name ?? "—";
        byProject.set(p, [...(byProject.get(p) ?? []), t]);
      }
      for (const [p, ts] of byProject) {
        lines.push(`  ${escHtml(p)}`);
        for (const t of ts.slice(0, 6)) lines.push(`  • ${escHtml(t.ticket_key ?? "")} ${escHtml(t.title)}`);
        if (ts.length > 6) lines.push(`  … +${ts.length - 6}`);
      }
    };
    group("Today", tk.today);
    group("Overdue", tk.overdue);
    group("Done — verify live", tk.verify);
    sections.push(lines.join("\n"));
  }

  // BLOCKERS — skip when empty
  if (data.blockers.length > 0) {
    const lines = ["🚨 <b>BLOCKERS</b>"];
    for (const b of data.blockers) {
      const tone = blockerTone(b);
      const days = b.stuckDays <= 0 ? "<1" : String(b.stuckDays);
      lines.push(`• [${tone}] ${escHtml(b.title)} (${days}d stuck)`);
    }
    sections.push(lines.join("\n"));
  }

  // YOU
  sections.push(
    [
      "🧠 <b>YOU</b>",
      `Habits: ${data.habits.done}/${data.habits.total} yesterday · Streak: ${data.streak} ${data.streak === 1 ? "day" : "days"}`,
    ].join("\n")
  );

  // FINANCE — omit if no snapshot
  if (data.finance) {
    const nw = data.finance.current.snapshot.net_worth;
    const nwStr = `£${Math.round(nw).toLocaleString("en-GB")}`;
    let line = nwStr;
    if (data.finance.delta !== null) {
      const deltaStr = fmtCurrencyShort(data.finance.delta);
      const pctStr =
        data.finance.pct !== null
          ? `, ${data.finance.pct >= 0 ? "+" : "−"}${Math.abs(data.finance.pct).toFixed(2)}%`
          : "";
      line += ` (${deltaStr} overnight${pctStr})`;
    }
    sections.push(["💰 <b>FINANCE</b>", line].join("\n"));
  }

  // WEATHER — omit if fetch failed
  if (data.weather) {
    sections.push(
      [
        "🌤 <b>WEATHER</b>",
        `Hi ${data.weather.hi}°C · Lo ${data.weather.lo}°C · ${escHtml(data.weather.conditions)}`,
      ].join("\n")
    );
  }

  // CAPTURE REVIEW — only when there's a backlog. One terse line at the
  // foot of the message so the daily summary stays quiet when triage is
  // up to date.
  if (data.reviewCount > 0) {
    const noun = data.reviewCount === 1 ? "capture" : "captures";
    sections.push(
      `📥 ${data.reviewCount} ${noun} need review → mycelium.sporebit.com/organisation/captures/review`,
    );
  }

  return sections.join("\n\n");
}
