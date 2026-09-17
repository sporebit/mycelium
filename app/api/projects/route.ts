import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";
import { PROJECT_SELECT_TICKETS, projectTicketFields } from "@/lib/tickets/projects";

export const runtime = "nodejs";

const PROJECT_SELECT = PROJECT_SELECT_TICKETS;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .order("created_at", { ascending: false });
    if (status && PROJECT_STATUSES.includes(status as ProjectStatus)) {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) throw error;
    auditListRead(req, data, "organisation", "tickets");
    const projects = (data ?? []) as Project[];

    // Task counts per project (open tasks only)
    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const { data: taskRows } = await supabase
        .from("tickets")
        .select("id, project_id")
        .is("deleted_at", null)
        .is("completed_at", null)
        .in("project_id", ids);
      const counts = new Map<string, number>();
      for (const row of (taskRows ?? []) as Array<{ project_id: string }>) {
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      }
      for (const p of projects) p.task_count = counts.get(p.id) ?? 0;
    }

    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[/api/projects GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  colour?: string | null;
  // Tickets (0116): per-project key prefix, area, GitHub settings (spec §11)
  prefix?: string | null;
  area_id?: string | null;
  github_repo?: string | null;
  github_issues_sync?: boolean;
};

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const insertPayload = { name,
      description: body.description ?? null,
      status:
        body.status && PROJECT_STATUSES.includes(body.status)
          ? body.status
          : "active",
      colour: body.colour ?? null,
      ...projectTicketFields(body as Record<string, unknown>),
    };
    const { data, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({ project: data as Project });
  } catch (err) {
    console.error("[/api/projects POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
