/**
 * Tickets — GitHub + Vercel automation (spec §7.1, §14.3, Flag 3).
 *
 * - Keys in commit messages / PR titles: `MYC-142: …` or `[MYC-142]`.
 * - push to the default branch and merged PRs → ticket_links commit/pr and
 *   category doing/next/backlog/inbox → Verify (forward only).
 * - Vercel deployment.succeeded (production) → tickets in Verify with code
 *   evidence → smoke (GET smoke_url expecting 200 + ok:true) → Done with
 *   deploy + smoke links; verified_by stays null until Phil taps.
 * - Step-driven kinds (RUNBOOK_KINDS) get the link but never the move, on
 *   either webhook — see isStepDriven.
 * - Issues sync is opt-in per project (projects.github_issues_sync). v1 uses
 *   a GITHUB_TOKEN (PAT or App installation token) for outbound calls; the
 *   loop guard ignores inbound events by GITHUB_BOT_LOGIN and anything
 *   already carrying github_synced_at within 30 s.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { RUNBOOK_KINDS, TICKET_KEY_RE } from "./categories";
import { moveTicket, resolveTicketRef, statusIdFor } from "./server";

export function keysIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(new Set((text.match(TICKET_KEY_RE) ?? []).map((k) => k.toUpperCase())));
}

/** Constant-time compare of two hex/base64 strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function hmacHex(algo: "SHA-256" | "SHA-1", secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: algo }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyGithubSignature(body: string, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = await hmacHex("SHA-256", secret, body);
  return safeEqual(header.slice(7), expected);
}

export async function verifyVercelSignature(body: string, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !header) return false;
  const expected = await hmacHex("SHA-1", secret, body);
  return safeEqual(header, expected);
}

export type CodeEvidence = { key: string; kind: "commit" | "pr"; url: string; ref: string; label: string };

/**
 * Step-driven kinds (runbook, test, guide, audit, setup) are finished by their
 * steps, not by a deploy: a commit naming the key is a record, never proof the
 * check was run. Automation links them and leaves the category alone.
 */
export function isStepDriven(kind: string | null | undefined): boolean {
  return (RUNBOOK_KINDS as readonly string[]).includes(kind ?? "");
}

/** Attach evidence and move the ticket to Verify (automation: forward only). */
export async function applyCodeEvidence(db: SupabaseClient, ev: CodeEvidence): Promise<{ key: string; moved: boolean; reason?: string }> {
  const ref = await resolveTicketRef(db, ev.key);
  if (!ref) return { key: ev.key, moved: false, reason: "unknown key" };
  const { data: existing } = await db.from("ticket_links").select("id").eq("ticket_id", ref.id).eq("ref", ev.ref).limit(1);
  if (!existing?.length) {
    await db.from("ticket_links").insert({ ticket_id: ref.id, kind: ev.kind, ref: ev.ref, url: ev.url, label: ev.label, meta: { via: "github" } });
  }
  if (isStepDriven(ref.kind)) return { key: ev.key, moved: false, reason: `${ref.kind} tickets close by their steps` };
  if (ref.category === "done" || ref.category === "cancelled" || ref.category === "verify") return { key: ev.key, moved: false, reason: `already ${ref.category}` };
  const moved = await moveTicket(db, ref.id, "verify", { forwardOnly: true });
  return { key: ev.key, moved: moved.ok, reason: moved.ok ? undefined : moved.error };
}

/** GET the project's smoke URL; ok when 200 and (no JSON or ok !== false). */
export async function runSmoke(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, { method: "GET", headers: { "user-agent": "mycelium-tickets-smoke" } });
    let ok = res.ok;
    try {
      const j = (await res.clone().json()) as { ok?: boolean };
      if (j && j.ok === false) ok = false;
    } catch {
      /* not JSON */
    }
    return { ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------------
// Issues sync (opt-in, v1: token-based outbound)
// ---------------------------------------------------------------------

export async function createGithubIssue(repo: string, title: string, body: string): Promise<{ number: number; html_url: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "mycelium-tickets" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    console.error("[github] create issue failed", res.status, await res.text());
    return null;
  }
  const j = (await res.json()) as { number: number; html_url: string };
  return { number: j.number, html_url: j.html_url };
}

/** Inbound: an issue opened on GitHub → an Inbox ticket for the linked project. */
export async function ticketFromIssue(
  db: SupabaseClient,
  repo: string,
  issue: { number: number; title: string; body?: string | null; html_url: string; user?: { login?: string } },
): Promise<string | null> {
  const { data: project } = await db.from("projects").select("id, space_id, github_issues_sync").eq("github_repo", repo).maybeSingle();
  if (!project || !project.github_issues_sync) return null;
  if (process.env.GITHUB_BOT_LOGIN && issue.user?.login === process.env.GITHUB_BOT_LOGIN) return null;
  const { data: dup } = await db.from("tickets").select("id").eq("github_issue_number", issue.number).eq("project_id", project.id).limit(1);
  if (dup?.length) return dup[0].id as string;
  const status = await statusIdFor(db, project.space_id as string, "inbox");
  const { data, error } = await db
    .from("tickets")
    .insert({
      title: issue.title,
      description: issue.body ?? null,
      project_id: project.id,
      space_id: project.space_id,
      kind: "task",
      source: "github",
      github_issue_number: issue.number,
      github_issue_url: issue.html_url,
      github_synced_at: new Date().toISOString(),
      status_id: status,
      urgency: "this_week",
      priority_score: 0.5,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  await db.from("ticket_links").insert({ ticket_id: data.id, kind: "github_issue", ref: String(issue.number), url: issue.html_url, label: `#${issue.number}` });
  return data.id as string;
}
