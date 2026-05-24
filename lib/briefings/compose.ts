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

function blockerTone(b: BriefingData["blockers"][number]): "HOT" | "WARM" {
  if (b.isOverdue) return "HOT";
  if (b.key && b.urgency === "today") return "HOT";
  return "WARM";
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

  return sections.join("\n\n");
}
