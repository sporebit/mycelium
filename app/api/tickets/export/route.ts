import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { listTickets, type TicketRow } from "@/lib/tickets/query";
import { CATEGORY_LABEL, type TicketCategory } from "@/lib/tickets/categories";

export const runtime = "nodejs";

/**
 * GET /api/tickets/export?project=<id|prefix|name>&format=backlog-md|json
 * (spec §11, §16). The weekly run regenerates claude/backlog.md from this;
 * the file is a read-only export. `done (unverified)` marks Done tickets
 * Phil has not verified live (Flag 1).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") === "json" ? "json" : "backlog-md";
  const projectParam = sp.get("project");
  try {
    const supabase = await createUserClient();
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, prefix, status, parent_id, area_id")
      .order("sort_order")
      .order("name");
    const projRows = (projects ?? []) as Array<{ id: string; name: string; prefix: string | null; status: string; parent_id: string | null }>;
    let projectId: string | null = null;
    if (projectParam) {
      const p = projRows.find(
        (r) => r.id === projectParam || (r.prefix ?? "").toUpperCase() === projectParam.toUpperCase() || r.name.toLowerCase() === projectParam.toLowerCase(),
      );
      if (!p) return NextResponse.json({ error: "project not found" }, { status: 404 });
      projectId = p.id;
    }

    // the root project plus its sub-projects share the export
    const ids = projectId ? [projectId, ...projRows.filter((r) => r.parent_id === projectId).map((r) => r.id)] : null;
    const open = await listTickets(supabase, { categories: ["inbox", "backlog", "next", "doing", "waiting", "verify"], limit: 1000, includeSubtasks: true });
    const closed = await listTickets(supabase, { categories: ["done", "cancelled"], limit: 500 });
    const all = [...open.tickets, ...closed.tickets].filter((t) => !ids || (t.project_id && ids.includes(t.project_id)));

    if (format === "json") {
      return NextResponse.json({ generated_at: new Date().toISOString(), project: projectParam, tickets: all });
    }

    const byProject = new Map<string, TicketRow[]>();
    for (const t of all) {
      const k = t.project_id ?? "__inbox";
      byProject.set(k, [...(byProject.get(k) ?? []), t]);
    }
    const nameOf = (id: string) => (id === "__inbox" ? "Inbox (unprojected)" : (projRows.find((p) => p.id === id)?.name ?? id));
    const ORDER: TicketCategory[] = ["doing", "next", "verify", "waiting", "inbox", "backlog", "done", "cancelled"];
    const lines: string[] = [];
    lines.push(`# Mycelium — Backlog (generated)`);
    lines.push("");
    lines.push(
      `*Generated ${new Date().toISOString()} from the ticket DB by \`GET /api/tickets/export?format=backlog-md${projectParam ? `&project=${projectParam}` : ""}\`. Do not edit by hand — the DB is canonical (tickets spec §16). \`done (unverified)\` = automation closed it with evidence; Phil has not yet verified it live.*`,
    );
    lines.push("");
    for (const [pid, rows] of byProject) {
      lines.push(`## ${nameOf(pid)}`);
      lines.push("");
      const sorted = [...rows].sort((a, b) => ORDER.indexOf((a.category ?? "backlog") as TicketCategory) - ORDER.indexOf((b.category ?? "backlog") as TicketCategory) || (a.seq ?? 0) - (b.seq ?? 0));
      for (const t of sorted) {
        if (t.parent_task_id) continue;
        const cat = (t.category ?? "backlog") as TicketCategory;
        const status =
          cat === "done" ? (t.verified_at ? "done" : "done (unverified)") : cat === "cancelled" ? "cancelled" : cat === "waiting" ? "blocked" : cat === "doing" ? "in-progress" : cat === "next" || cat === "verify" ? "committed" : t.someday ? "idea" : "committed";
        const tags = [t.source === "claude" ? "`[claude]`" : "", t.urgent ? "**urgent**" : ""].filter(Boolean).join(" ");
        const dates = [t.scheduled_on ? `scheduled ${t.scheduled_on}` : "", t.deadline_on ? `deadline ${t.deadline_on}` : ""].filter(Boolean).join(", ");
        const subs = rows.filter((s) => s.parent_task_id === t.id);
        lines.push(`- **${status}** \`${t.ticket_key ?? ""}\` ${tags} — ${t.title}${dates ? ` (${dates})` : ""}${t.waiting_on_name ? ` — waiting on ${t.waiting_on_name}` : ""}`);
        if (t.description) lines.push(`  ${t.description.replace(/\s+/g, " ").slice(0, 400)}`);
        for (const s of subs) lines.push(`  - ${s.category === "done" ? "[x]" : "[ ]"} \`${s.ticket_key ?? ""}\` ${s.title}`);
      }
      lines.push("");
    }
    lines.push(`*Categories: ${ORDER.map((c) => CATEGORY_LABEL[c]).join(" · ")}.*`);
    return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/tickets/export GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
