"use client";

import { Mono } from "@/components/dashboard/Mono";
import { fmtHm } from "@/lib/hours/calc";
import { Card } from "./kit";
import { useHoursBundle } from "./useHours";

/** Rules (spec §5 "Rules: static help"): §2 of the spec, with the live settings filled in. */
export function RulesView() {
  const { index } = useHoursBundle();
  const target = index?.settings.target ?? 2250;
  const stdDay = index?.settings.stdDay ?? 450;
  const threshold = index?.settings.threshold ?? 1500;
  const label = index?.settings.checkpointLabel ?? "Wednesday 13:00";
  const weeks = index?.settings.reviewWeeks ?? 6;
  const rows: Array<[string, React.ReactNode]> = [
    ["Weekly target", <><Mono>{fmtHm(target)}</Mono>, Monday to Thursday. Breaks are not counted.</>],
    ["When", "Fully flexible: only the total matters. Durations are logged without start or end times."],
    ["Friday", "Off if the target is met by close of Thursday. A standing expectation, not a weekly request."],
    ["Surplus", "Lost. No rollover, no TOIL. Resets on Monday."],
    ["Shortfall", "Friday owes the remainder only, never a full day. Worked Friday morning."],
    ["Bank holiday, annual leave, sick", <>Credits a standard day (<Mono>{fmtHm(stdDay)}</Mono>) on that date. Bank holidays are automatic (England and Wales); absences are entered by hand in Settings.</>],
    [`${label} checkpoint`, <>Send the Friday block-out only if banked hours are at least <Mono>{fmtHm(threshold)}</Mono>. The Dashboard shows SEND or HOLD; there is no clock logic — read it at the moment you decide.</>],
    ["Non-ticket time", "Goes on a catch-all ticket, so every entry should carry a ticket. An entry with no ticket shows red."],
    ["Logged", "The tick on an entry means the same time has also been put into Jira by hand. Amber until then."],
    ["Review", <>Tracking start + {weeks} weeks. Informational; History covers it.</>],
  ];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Rules</h1>
      <Card aside="agreed September 2026 · figures from Settings">
        <dl className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-x-6 gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-text-mid font-medium">{k}</dt>
              <dd className="text-text-hi">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="How the figures are worked out">
        <ul className="text-sm text-text-mid flex flex-col gap-1.5 list-disc pl-5">
          <li>A day&apos;s total is the time logged on it plus any credit (bank holiday or absence).</li>
          <li>Banked is the Mon–Thu total; remaining is the target less banked, never below zero.</li>
          <li>Even pace today is what is left of the target spread over the Mon–Thu days left, including today.</li>
          <li>Pace to Thursday spreads the remainder over the days from tomorrow to Thursday; including Friday adds a day.</li>
          <li>History marks a week Met, Short, or Covered on Friday when Friday&apos;s hours reach the shortfall.</li>
          <li>Nothing is stored as a figure: every number is derived from the Log, absences and bank holidays each time.</li>
        </ul>
      </Card>
    </div>
  );
}
