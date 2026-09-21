import { NextRequest, NextResponse } from "next/server";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { isStepDriven, runSmoke, verifyVercelSignature } from "@/lib/tickets/github";
import { moveTicket } from "@/lib/tickets/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type VercelPayload = {
  type?: string;
  createdAt?: number;
  payload?: {
    target?: string | null;
    url?: string;
    deployment?: { id?: string; url?: string; meta?: Record<string, string> };
    project?: { id?: string; name?: string };
  };
};

/**
 * POST /api/tickets/vercel — Vercel deployment webhook (spec §7.1).
 * Public prefix; HMAC-SHA1 x-vercel-signature with VERCEL_WEBHOOK_SECRET.
 * deployment.succeeded on production → every ticket in Verify that carries
 * code evidence (a commit or pr link created before the deploy) runs the
 * project's smoke check; green → Done with deploy + smoke links. Pushes to
 * main fast-forward, so "linked before this deploy" ≈ "in the deployed
 * range" — the approximation is recorded on the link.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifyVercelSignature(raw, req.headers.get("x-vercel-signature"), process.env.VERCEL_WEBHOOK_SECRET))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let body: VercelPayload;
  try {
    body = JSON.parse(raw) as VercelPayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (body.type !== "deployment.succeeded") return NextResponse.json({ ok: true, skipped: body.type });
  if (body.payload?.target !== "production") return NextResponse.json({ ok: true, skipped: `target ${body.payload?.target}` });

  const deployedAt = new Date(body.createdAt ?? Date.now()).toISOString();
  const deployUrl = body.payload?.deployment?.url ? `https://${body.payload.deployment.url}` : (body.payload?.url ?? null);
  const sha = body.payload?.deployment?.meta?.githubCommitSha ?? null;
  const smokeUrl = process.env.TICKETS_SMOKE_URL ?? "https://mycelium.sporebit.com/api/health";

  try {
    const result = await withUser(boundUser("cron"), async (db) => {
      const { data: rows } = await db
        .from("tickets")
        .select("id, ticket_key, kind, ticket_status:ticket_statuses!inner(category)")
        .eq("ticket_status.category", "verify")
        .is("deleted_at", null)
        .limit(100);
      // Step-driven kinds wait in Verify for their steps, not for a deploy.
      const candidates = ((rows ?? []) as Array<{ id: string; ticket_key: string | null; kind: string | null }>).filter(
        (c) => !isStepDriven(c.kind),
      );
      if (candidates.length === 0) return { verify: 0 };

      const { data: links } = await db
        .from("ticket_links")
        .select("ticket_id, kind, at")
        .in("ticket_id", candidates.map((c) => c.id))
        .in("kind", ["commit", "pr"])
        .lte("at", deployedAt);
      const withCode = new Set((links ?? []).map((l) => (l as { ticket_id: string }).ticket_id));
      const targets = candidates.filter((c) => withCode.has(c.id));
      if (targets.length === 0) return { verify: candidates.length, with_code: 0 };

      const smoke = await runSmoke(smokeUrl);
      const done: string[] = [];
      for (const t of targets) {
        await db.from("ticket_links").insert([
          { ticket_id: t.id, kind: "deploy", ref: body.payload?.deployment?.id ?? null, url: deployUrl, label: `production deploy${sha ? ` ${sha.slice(0, 7)}` : ""}`, meta: { via: "vercel", approximation: "linked before deploy" } },
          { ticket_id: t.id, kind: "smoke", ref: String(smoke.status), url: smokeUrl, label: smoke.ok ? "smoke green" : `smoke failed (${smoke.status})`, meta: { ok: smoke.ok } },
        ]);
        if (smoke.ok) {
          const moved = await moveTicket(db, t.id, "done", { forwardOnly: true });
          if (moved.ok) done.push(t.ticket_key ?? t.id);
        }
      }
      return { verify: candidates.length, with_code: targets.length, smoke, done };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[tickets/vercel]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
