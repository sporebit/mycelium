import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { listTickets } from "@/lib/tickets/query";
import { parseArea } from "@/lib/tickets/area";
import { mergeSuggestions, suggestContexts, type Suggestion } from "@/lib/tickets/suggest";

export const runtime = "nodejs";

/**
 * GET /api/tickets/clarify — the Inbox queue, oldest first, each with a
 * suggestion to accept or adjust (spec §11, §8.4). The stored capture
 * suggestion wins; a heuristic fills the gaps.
 */
export async function GET(req: NextRequest) {
  // ?category=backlog → triage mode: the same card stack over Backlog
  // tickets that are not parked as someday (oldest first).
  const triageBacklog = req.nextUrl.searchParams.get("category") === "backlog";
  // The Area chip (tasks-merge M2) narrows the stack the same way it narrows the lists.
  const area = parseArea(req.nextUrl.searchParams.get("area"));
  const scope = { areaKind: area.kind, areaId: area.areaId, projectId: req.nextUrl.searchParams.get("project") };
  try {
    const supabase = await createUserClient();
    const [{ tickets }, projects] = await Promise.all([
      triageBacklog
        ? listTickets(supabase, { categories: ["backlog"], someday: false, limit: 200, ...scope })
        : listTickets(supabase, { list: "inbox", limit: 100, ...scope }),
      supabase
        .from("projects")
        .select("id, name, prefix")
        .neq("status", "archived"),
    ]);
    const projectRows = (projects.data ?? []) as Array<{
      id: string;
      name: string;
      prefix: string | null;
    }>;
    const items = tickets.map((t) => {
      const heuristic = suggestContexts(t.title, t.description, projectRows);
      const suggestion: Suggestion = mergeSuggestions(t.suggested ?? null, heuristic);
      return { ticket: t, suggestion };
    });
    auditListRead(req, tickets, "organisation", "tickets");
    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[/api/tickets/clarify GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
