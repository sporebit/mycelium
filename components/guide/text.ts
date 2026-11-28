/**
 * Small text helpers for the Field guide renderer. "Someone" mode (D5)
 * drops `{{key}}` placeholders that have no answer instead of showing
 * `<key>`, and hides shell and prompt blocks.
 */
import { substitute, unresolved, type StepBlock, type StepsDefinition, type StepsState } from "@/lib/tickets/steps";

export type GuideMode = "me" | "someone";

const SHELL_LANGS = new Set(["powershell", "ps1", "pwsh", "bash", "sh", "shell", "zsh", "cmd", "bat", "console"]);

/** `{{key}}` substitution; in someone mode an unanswered key disappears. */
export function fill(text: string | null | undefined, def: StepsDefinition, state: StepsState, mode: GuideMode): string {
  if (!text) return "";
  if (mode === "someone") {
    return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => state.answers[key] ?? "");
  }
  return substitute(text, def, state);
}

/** A block that belongs in a terminal or in Claude's prompt box: hidden in someone mode. */
export function isShellBlock(b: StepBlock): boolean {
  if (b.kind === "command" || b.kind === "prompt") return true;
  if (b.shells && Object.keys(b.shells).length > 0) return true;
  return !!b.lang && SHELL_LANGS.has(b.lang.toLowerCase());
}

/** The text of a block for the chosen shell. */
export function blockText(b: StepBlock, shell: string | undefined): string {
  return b.shells ? (b.shells[shell ?? ""] ?? Object.values(b.shells)[0] ?? "") : (b.text ?? "");
}

/** A where-link that resolved to a real address, or null. */
export function whereHref(url: string | null | undefined, def: StepsDefinition, state: StepsState): string | null {
  if (!url) return null;
  const u = substitute(url, def, state);
  if (unresolved(u)) return null;
  return /^(https?:\/\/|\/)/i.test(u) ? u : null;
}

/** "Copy command", "Copy value", "Copy prompt", or "Copy". */
export function copyLabel(kind: StepBlock["kind"]): string {
  if (kind === "command") return "Copy command";
  if (kind === "value") return "Copy value";
  if (kind === "prompt") return "Copy prompt";
  return "Copy";
}

/** The plain text of a small piece of authored HTML, for the clipboard. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
