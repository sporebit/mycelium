import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExportBody = {
  sections: string[];
  format: "json" | "csv" | "pdf";
  dateRange?: { from?: string; to?: string };
  options?: { includeMetadata?: boolean; anonymise?: boolean };
};

type TableDef = { table: string; label: string; dateCol?: string };

const SECTION_TABLES: Record<string, TableDef[]> = {
  organisation: [
    { table: "tasks", label: "tasks", dateCol: "created_at" },
    { table: "compost_items", label: "captures", dateCol: "created_at" },
    { table: "people", label: "people", dateCol: "created_at" },
  ],
  fitness: [
    { table: "workout_sessions", label: "workout_sessions", dateCol: "date" },
    { table: "exercises", label: "exercises" },
  ],
  health: [
    { table: "nutrition_logs", label: "nutrition_logs", dateCol: "logged_at" },
    { table: "body_metrics", label: "body_metrics", dateCol: "measured_at" },
    { table: "recipes", label: "recipes" },
  ],
  finance: [
    { table: "bank_transactions", label: "transactions", dateCol: "date" },
    { table: "accounts", label: "accounts" },
    { table: "investments", label: "investments" },
  ],
  studio: [
    { table: "spotify_plays", label: "spotify_plays", dateCol: "played_at" },
  ],
  ventures: [
    { table: "ventures", label: "ventures" },
    { table: "venture_steps", label: "venture_steps" },
    { table: "venture_ads", label: "venture_ads" },
    { table: "venture_inspiration", label: "venture_inspiration" },
  ],
  "the-boys": [
    { table: "agent_conversations", label: "agent_conversations" },
    { table: "agent_memory", label: "agent_memory" },
  ],
};

const META_COLS = ["id", "user_id", "created_at", "updated_at"];

function stripMeta(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!META_COLS.includes(k)) out[k] = v;
    }
    return out;
  });
}

function anonymise(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out = { ...r };
    for (const k of ["first_name", "last_name", "display_name", "email", "phone", "address"]) {
      if (k in out) out[k] = "Redacted";
    }
    return out;
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportBody;
    const { sections, format, dateRange, options } = body;

    if (format === "pdf") {
      return NextResponse.json({ error: "PDF export coming soon" }, { status: 501 });
    }

    const supabase = createServerClient();
    const allData: Record<string, Record<string, unknown>[]> = {};

    for (const sectionKey of sections) {
      const tables = SECTION_TABLES[sectionKey];
      if (!tables) continue;
      for (const t of tables) {
        let q = supabase.from(t.table).select("*").order("created_at" in t ? "created_at" : "id", { ascending: false }).limit(10000);
        if (dateRange?.from && t.dateCol) q = q.gte(t.dateCol, dateRange.from);
        if (dateRange?.to && t.dateCol) q = q.lte(t.dateCol, dateRange.to);
        try {
          const { data } = await q;
          let rows = (data ?? []) as Record<string, unknown>[];
          if (!options?.includeMetadata) rows = stripMeta(rows);
          if (options?.anonymise) rows = anonymise(rows);
          allData[t.label] = rows;
        } catch {
          allData[t.label] = [];
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const jsonStr = JSON.stringify(allData, null, 2);
      return new NextResponse(jsonStr, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="mycelium-export-${today}.json"`,
        },
      });
    }

    if (format === "csv") {
      const { Readable } = await import("stream");

      const parts: { name: string; content: string }[] = [];
      for (const [name, rows] of Object.entries(allData)) {
        if (rows.length > 0) parts.push({ name, content: toCsv(rows) });
      }

      if (parts.length === 1) {
        return new NextResponse(parts[0].content, {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="mycelium-export-${today}-${parts[0].name}.csv"`,
          },
        });
      }

      // Multiple CSVs: build a simple combined CSV with section headers
      const combined = parts
        .map((p) => `--- ${p.name} ---\n${p.content}`)
        .join("\n\n");
      return new NextResponse(combined, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="mycelium-export-${today}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "unsupported format" }, { status: 400 });
  } catch (err) {
    console.error("[export POST]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
