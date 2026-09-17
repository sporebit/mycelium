import { NextRequest, NextResponse } from "next/server";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { applyCodeEvidence, keysIn, ticketFromIssue, verifyGithubSignature, type CodeEvidence } from "@/lib/tickets/github";

export const runtime = "nodejs";

type PushPayload = {
  ref?: string;
  repository?: { full_name?: string; default_branch?: string; html_url?: string };
  commits?: Array<{ id: string; message: string; url: string }>;
};
type PrPayload = {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: { number: number; title: string; body?: string | null; merged?: boolean; html_url: string; merge_commit_sha?: string | null };
};
type IssuePayload = {
  action?: string;
  repository?: { full_name?: string };
  issue?: { number: number; title: string; body?: string | null; html_url: string; user?: { login?: string } };
};

/**
 * POST /api/tickets/github — GitHub App / repo webhook (spec §7.1, §14.3).
 * Public prefix; HMAC X-Hub-Signature-256 with GITHUB_WEBHOOK_SECRET.
 *   push (default branch)          → commit links + Verify for each key
 *   pull_request closed && merged  → pr link + Verify for each key
 *   issues opened (opt-in repo)    → Inbox ticket (loop-guarded)
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifyGithubSignature(raw, req.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const result = await withUser(boundUser("cron"), async (db) => {
      if (event === "ping") return { pong: true };

      if (event === "push") {
        const p = payload as PushPayload;
        const branch = p.ref?.replace("refs/heads/", "");
        if (!branch || branch !== (p.repository?.default_branch ?? "main")) return { skipped: `branch ${branch}` };
        const results: Array<{ key: string; moved: boolean; reason?: string }> = [];
        for (const c of p.commits ?? []) {
          for (const key of keysIn(c.message)) {
            const ev: CodeEvidence = { key, kind: "commit", url: c.url, ref: c.id, label: `${c.id.slice(0, 7)} ${c.message.split("\n")[0].slice(0, 80)}` };
            results.push(await applyCodeEvidence(db, ev));
          }
        }
        return { commits: (p.commits ?? []).length, results };
      }

      if (event === "pull_request") {
        const p = payload as PrPayload;
        if (p.action !== "closed" || !p.pull_request?.merged) return { skipped: `pr ${p.action}` };
        const pr = p.pull_request;
        const results: Array<{ key: string; moved: boolean; reason?: string }> = [];
        for (const key of keysIn(`${pr.title}\n${pr.body ?? ""}`)) {
          results.push(await applyCodeEvidence(db, { key, kind: "pr", url: pr.html_url, ref: `pr-${pr.number}`, label: `#${pr.number} ${pr.title.slice(0, 80)}` }));
        }
        return { pr: pr.number, results };
      }

      if (event === "issues") {
        const p = payload as IssuePayload;
        if (p.action !== "opened" || !p.issue || !p.repository?.full_name) return { skipped: `issues ${p.action}` };
        const id = await ticketFromIssue(db, p.repository.full_name, p.issue);
        return { issue: p.issue.number, ticket: id };
      }

      return { skipped: event };
    });
    return NextResponse.json({ ok: true, event, ...result });
  } catch (err) {
    console.error("[tickets/github]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
