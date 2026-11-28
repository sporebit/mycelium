/**
 * The downloadable Field guide (design §4, `GET /api/tickets/[key]/guide.html`):
 * one self-contained HTML document, read-only, with the current ticks and
 * answers. Inline CSS from the same --fg-* values as app/globals.css (both
 * themes through light-dark()), no scripts, no external fonts (system serif
 * and mono fallbacks), folds as <details>. Every answer passes the secret
 * guard again on the way out: one that looks like a secret is left out.
 * Pure: the route passes the time in.
 */
import { escapeHtml, sanitizeHtml } from "@/lib/tickets/sanitize";
import { routeLabel, substitute, unresolved, type Step, type StepBlock, type StepsDefinition, type StepsState } from "@/lib/tickets/steps";
import { freshness, guideToggles, londonTime, longDate, overall, phaseProgress, flightPlan, stepHistory, todayLondonDate } from "./progress";
import { isSecretLike } from "./secret";

const CSS = `
:root{color-scheme:light dark;
--fg-paper:light-dark(#f3efe4,#121410);--fg-paper-2:light-dark(#eae5d7,#181b16);--fg-paper-3:light-dark(#dfd9c9,#1f231d);
--fg-line:light-dark(rgba(30,32,25,.12),rgba(236,230,210,.10));--fg-ink:light-dark(#1e2019,#e6e1d0);--fg-ink-soft:light-dark(#5d6054,#a9a593);
--fg-ink-faint:light-dark(#8b8d80,#6c6e62);--fg-moss:light-dark(#3f7a4e,#8fb996);--fg-moss-wash:light-dark(rgba(63,122,78,.10),rgba(143,185,150,.09));
--fg-amber:light-dark(#9a6a1d,#d9b06a);--fg-umber:light-dark(#9e4a30,#cf8368);
--body:Georgia,"Times New Roman",serif;--ui:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,Consolas,"Courier New",monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--fg-paper);color:var(--fg-ink);font:17px/1.55 var(--body)}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;line-height:1.2;font-weight:500;margin:0 0 4px}
h2{font-size:20px;font-weight:500;margin:0}
.meta,.soft{color:var(--fg-ink-soft);font:13px/1.5 var(--ui)}
.mono{font-family:var(--mono)}
.answer{font-size:22px;line-height:1.35;margin:20px 0 16px}
.cards{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:0 0 12px}
.card{background:var(--fg-paper-2);border:1px solid var(--fg-line);border-radius:10px;padding:10px 12px;font-size:15px}
.label{font:600 11px/1.4 var(--ui);letter-spacing:.08em;text-transform:uppercase;color:var(--fg-ink-soft);margin-bottom:4px}
.amber{color:var(--fg-amber)}
.bar{height:6px;border-radius:3px;background:var(--fg-paper-3);overflow:hidden;margin:16px 0 6px}
.bar>span{display:block;height:100%;background:var(--fg-moss)}
section.phase{background:var(--fg-paper-2);border:1px solid var(--fg-line);border-radius:12px;padding:14px 16px;margin:14px 0}
.phase-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
ol.steps{list-style:none;margin:12px 0 0;padding:0}
li.step{border-top:1px solid var(--fg-line);padding:12px 0}
li.step.irreversible{border-left:4px solid var(--fg-umber);padding-left:10px;background:repeating-linear-gradient(135deg,transparent 0 6px,var(--fg-moss-wash) 6px 7px)}
.row{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.tick{font-family:var(--mono);color:var(--fg-moss);min-width:1.4em}
.todo{font-family:var(--mono);color:var(--fg-ink-faint);min-width:1.4em}
.chip{font:12px/1.4 var(--ui);border:1px solid var(--fg-line);border-radius:999px;padding:1px 8px;color:var(--fg-ink-soft)}
.chip.umber{color:var(--fg-umber);border-color:var(--fg-umber)}
a{color:var(--fg-moss)}
pre{background:var(--fg-paper-3);border-radius:8px;padding:10px 12px;font:13px/1.5 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
code{font-family:var(--mono);font-size:.9em;background:var(--fg-paper-3);border-radius:4px;padding:0 4px}
.expect{border-left:3px solid var(--fg-moss);background:var(--fg-moss-wash);padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}
.failure{color:var(--fg-amber);font:14px/1.5 var(--ui)}
details{margin:8px 0}
summary{cursor:pointer;font:14px/1.5 var(--ui);color:var(--fg-ink-soft)}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border-bottom:1px solid var(--fg-line);text-align:left;padding:6px 8px;vertical-align:top}
.answerbox{font:14px/1.5 var(--mono);background:var(--fg-paper-3);border-radius:6px;padding:2px 8px}
footer{margin-top:28px}
@media print{body{background:#fff;color:#000}section.phase,.card{break-inside:avoid}}
`;

const e = escapeHtml;

function html(s: string | null | undefined, def: StepsDefinition, state: StepsState): string {
  return sanitizeHtml(substitute(s ?? "", def, state));
}

function blockText(b: StepBlock, shell: string | undefined): string {
  return b.shells ? (b.shells[shell ?? ""] ?? Object.values(b.shells)[0] ?? "") : (b.text ?? "");
}

const ACTOR: Record<string, string> = { you: "You", "claude-code": "Claude Code", gate: "Check" };

function stepHtml(step: Step, def: StepsDefinition, state: StepsState, toggles: Record<string, string>): string {
  const t = state.steps[step.id];
  const parts: string[] = [];
  const cls = step.irreversible ? "step irreversible" : "step";
  const whereUrl = step.where?.url ? substitute(step.where.url, def, state) : null;
  const where = step.where
    ? whereUrl && !unresolved(whereUrl) && /^(https?:\/\/|\/)/.test(whereUrl)
      ? `<a class="chip" href="${e(whereUrl)}">${e(step.where.label)}</a>`
      : `<span class="chip">${e(step.where.label)}</span>`
    : "";
  const mark = def.tested?.[step.id];
  parts.push(
    `<div class="row">${t?.done ? '<span class="tick" aria-label="done">&#10003;</span>' : '<span class="todo" aria-label="not done">&#9675;</span>'}` +
      `<span class="mono soft">${e(step.id)}</span> <strong>${e(step.title)}</strong>` +
      (step.actor ? ` <span class="chip">${e(ACTOR[step.actor] ?? step.actor)}</span>` : "") +
      (step.route ? ` <span class="chip">${e(routeLabel(def, step.route))}</span>` : "") +
      (where ? ` ${where}` : "") +
      (step.minutes ? ` <span class="mono soft">about ${step.minutes} min</span>` : "") +
      (step.irreversible ? ' <span class="chip umber">Cannot be undone</span>' : "") +
      (mark === "untested" ? ' <span class="chip">untested</span>' : "") +
      `</div>`,
  );
  const history = stepHistory(state, step.id);
  if (history) parts.push(`<div class="soft">${e(history)}</div>`);
  if (step.actor === "claude-code" && step.did_html) parts.push(`<div>Claude did this: ${html(step.did_html, def, state)}</div>`);
  if (step.body_html) parts.push(`<div>${html(step.body_html, def, state)}</div>`);
  for (const b of step.blocks ?? []) {
    const label = b.label ?? (b.kind === "prompt" ? "Prompt" : b.kind === "value" ? "Value" : "Command");
    parts.push(`<div class="label">${e(label)}</div><pre>${e(substitute(blockText(b, toggles.shell), def, state))}</pre>`);
  }
  if (step.value_html) parts.push(`<div class="label">Value</div><pre>${html(step.value_html, def, state)}</pre>`);
  for (const f of step.fields ?? []) {
    const a = state.answers[f.key];
    parts.push(`<div class="soft">${e(f.label)}: ${a ? `<span class="answerbox">${e(a)}</span>` : "<em>not filled in</em>"}</div>`);
  }
  for (const n of step.notes ?? []) parts.push(`<div class="soft">${html(n.html, def, state)}</div>`);
  if ((step.actor ?? "you") === "you") {
    parts.push(
      step.expect_html
        ? `<div class="expect"><div class="label">What you should see</div>${html(step.expect_html, def, state)}</div>`
        : `<div class="expect soft">No check written for this step</div>`,
    );
  }
  const f = state.failures?.[step.id];
  if (f) parts.push(`<div class="failure">This did not work at ${e(londonTime(f.at))}${f.note ? `: ${e(f.note)}` : ""}</div>`);
  if (step.troubleshooting?.length) {
    parts.push(
      `<details${f ? " open" : ""}><summary>If it did not work</summary><ul>${step.troubleshooting
        .map((x) => `<li><strong>${e(x.symptom)}</strong>: ${sanitizeHtml(x.fix)}</li>`)
        .join("")}</ul></details>`,
    );
  }
  return `<li class="${cls}">${parts.join("\n")}</li>`;
}

export type GuideHtmlMeta = { key: string; title: string; now: Date };

/** The whole document. */
export function renderGuideHtml(definition: StepsDefinition, rawState: StepsState, meta: GuideHtmlMeta): string {
  // The secret guard on the way out: an answer that looks like a secret never reaches the file.
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawState.answers ?? {})) if (!isSecretLike(v)) answers[k] = v;
  const state: StepsState = { ...rawState, answers };
  const def = definition;
  const toggles = guideToggles(def, state);
  const phases = phaseProgress(def, state);
  const all = overall(def, state, phases);
  const plan = flightPlan(def, state, phases);
  const intro = def.intro ?? {};
  const title = def.title || meta.title;
  const out: string[] = [];

  out.push(`<header><div class="meta mono">${e(meta.key)}</div><h1>${e(title)}</h1>`);
  out.push(`<div class="meta">Field guide, saved ${e(longDate(meta.now.toISOString()))} at ${e(londonTime(meta.now.toISOString()))}. Read-only copy: ticks and answers as they were then.</div></header>`);

  if (intro.answer) out.push(`<p class="answer">${e(intro.answer)}</p>`);
  else if (intro.verdict_html) out.push(`<div class="answer">${html(intro.verdict_html, def, state)}</div>`);

  const cards: string[] = [];
  if (intro.unlocks?.length) cards.push(`<div class="card"><div class="label">What this unlocks</div><ul>${intro.unlocks.map((u) => `<li>${e(u)}</li>`).join("")}</ul></div>`);
  if (intro.to_hand?.length) cards.push(`<div class="card"><div class="label">You will need to hand</div><ul>${intro.to_hand.map((u) => `<li>${e(u)}</li>`).join("")}</ul></div>`);
  if (intro.hard_part) cards.push(`<div class="card"><div class="label">The tricky bit</div>Step <span class="mono">${e(intro.hard_part.step_id)}</span>: ${e(intro.hard_part.why)}</div>`);
  if (cards.length) out.push(`<div class="cards">${cards.join("")}</div>`);

  const fresh = freshness(def, todayLondonDate(meta.now));
  if (intro.last_verified) {
    out.push(
      `<p class="meta${fresh === "amber" ? " amber" : ""}">Last verified ${e(longDate(intro.last_verified.slice(0, 10)))}${fresh === "amber" ? ", check before trusting" : ""}</p>`,
    );
  }
  if (def.basics_html) out.push(`<details><summary>The basics</summary>${html(def.basics_html, def, state)}</details>`);
  if (intro.comparison) {
    out.push(
      `<table><thead><tr>${intro.comparison.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${intro.comparison.rows
        .map((r) => `<tr>${r.map((c) => `<td>${sanitizeHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`,
    );
  }
  const before = [...(intro.prerequisites ?? []).map((p) => sanitizeHtml(p)), ...(intro.time ?? []).map((t) => `Time: ${e(t)}`), ...(intro.cost ?? []).map((c) => `Cost: ${e(c)}`)];
  if (before.length) out.push(`<details><summary>Before you start</summary><ul>${before.map((b) => `<li>${b}</li>`).join("")}</ul></details>`);

  out.push(`<div class="bar" role="img" aria-label="${all.pct} percent done"><span style="width:${all.pct}%"></span></div>`);
  out.push(`<p class="meta"><span class="mono">${all.pct}%</span>, <span class="mono">${all.done}</span> of <span class="mono">${all.total}</span> steps, about <span class="mono">${all.minutes_left_est}</span> min left. ${e(plan.summary)}.</p>`);

  for (const p of phases) {
    const minutes = p.state === "done" && p.minutes_actual !== null ? `${p.minutes_actual} min` : `about ${p.minutes_est} min`;
    out.push(`<section class="phase" id="phase-${e(p.id)}">`);
    out.push(
      `<div class="phase-head"><h2>Sitting <span class="mono">${p.n}</span> &middot; ${e(p.title)}</h2><span class="meta mono">${p.done}/${p.total} &middot; ${minutes}${p.state === "done" ? " &middot; finished" : ""}</span></div>`,
    );
    if (p.phase.needs?.length) out.push(`<div class="meta">Needs: ${p.phase.needs.map(e).join(", ")}</div>`);
    if (p.phase.hard_part) out.push(`<div class="meta">The tricky bit: ${e(p.phase.hard_part)}</div>`);
    if (p.phase.lede_html) out.push(`<div>${html(p.phase.lede_html, def, state)}</div>`);
    out.push(`<ol class="steps">${p.steps.map((s) => stepHtml(s, def, state, toggles)).join("\n")}</ol>`);
    if (p.phase.verify_html?.length) out.push(`<details><summary>Verify</summary><ul>${p.phase.verify_html.map((v) => `<li>${html(v, def, state)}</li>`).join("")}</ul></details>`);
    if (p.phase.why_html) out.push(`<details><summary>Why this works</summary>${html(p.phase.why_html, def, state)}</details>`);
    out.push(`</section>`);
  }

  if (all.total > 0 && all.done === all.total) {
    out.push(`<section class="phase"><h2>What now works</h2>`);
    if (def.finish_html) out.push(html(def.finish_html, def, state));
    else if (intro.unlocks?.length) out.push(`<ul>${intro.unlocks.map((u) => `<li>${e(u)}</li>`).join("")}</ul>`);
    out.push(`</section>`);
  }

  out.push(`<footer>`);
  if (def.rollback_html) out.push(`<details><summary>Rollback</summary>${html(def.rollback_html, def, state)}</details>`);
  if (def.troubleshooting?.length) {
    out.push(
      `<details><summary>Troubleshooting</summary><table><tbody>${def.troubleshooting
        .map((t) => `<tr><td>${e(t.symptom)}</td><td>${t.cause ? e(t.cause) : ""}</td><td>${t.fix ? sanitizeHtml(t.fix) : ""}</td></tr>`)
        .join("")}</tbody></table></details>`,
    );
  }
  if (def.links?.length) {
    out.push(
      `<div class="label">Links</div><ul>${def.links
        .map((l) => {
          const url = substitute(l.url, def, state);
          const ok = !unresolved(url) && /^(https?:\/\/|\/)/.test(url);
          return `<li>${ok ? `<a href="${e(url)}">${e(l.label)}</a>` : e(l.label)}${l.note ? `: ${e(l.note)}` : ""}</li>`;
        })
        .join("")}</ul>`,
    );
  }
  if (intro.sources?.length) {
    out.push(
      `<div class="label">Sources</div><ul>${intro.sources
        .map((s) => `<li>${/^https?:\/\//.test(s.url) ? `<a href="${e(s.url)}">${e(s.label)}</a>` : e(s.label)} <span class="soft">checked ${e(longDate(s.checked_on))}</span></li>`)
        .join("")}</ul>`,
    );
  }
  out.push(`</footer>`);

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${out.join("\n")}
</main>
</body>
</html>
`;
}

/** `<key>-<slug>.html`, filename-safe. */
export function guideFilename(key: string, def: StepsDefinition): string {
  const slug = (def.slug || def.title || "guide").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "guide";
  const k = key.replace(/[^A-Za-z0-9-]/g, "");
  return `${k}-${slug}.html`;
}
