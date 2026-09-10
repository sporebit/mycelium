/**
 * Outbound email through Resend. One sender, one place.
 *
 * Without RESEND_API_KEY (every local run until Phil completes checklist
 * §2) nothing is sent: the message is logged with its link so the flow can
 * still be exercised, and the caller is told it was not delivered so the UI
 * can show the link instead. Never log a token in production: the fallback
 * only runs when the key is absent, which production must never be.
 */
import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Mycelium <invites@sporebit.com>";

export type SendResult = { delivered: boolean; id?: string; error?: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — not sent. To: ${input.to} Subject: ${input.subject}\n${input.text}`);
    return { delivered: false, error: "RESEND_API_KEY not set" };
  }
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) return { delivered: false, error: error.message };
  return { delivered: true, id: data?.id };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendInviteEmail(input: {
  to: string;
  link: string;
  teamName: string | null;
  role: string;
  inviterName: string | null;
}): Promise<SendResult> {
  const who = input.inviterName ?? "Someone";
  const where = input.teamName ? `the team "${input.teamName}"` : "Mycelium";
  const subject = input.teamName ? `${who} invited you to ${input.teamName}` : `${who} invited you to Mycelium`;
  const text =
    `${who} has invited you to join ${where} as ${input.role}.\n\n` +
    `Accept the invitation (valid for 7 days, single use):\n${input.link}\n\n` +
    `If you were not expecting this, ignore this email.`;
  const html =
    `<p>${escapeHtml(who)} has invited you to join ${escapeHtml(where)} as <strong>${escapeHtml(input.role)}</strong>.</p>` +
    `<p><a href="${escapeHtml(input.link)}">Accept the invitation</a> — valid for 7 days, single use.</p>` +
    `<p>If you were not expecting this, ignore this email.</p>`;
  return sendEmail({ to: input.to, subject, html, text });
}
