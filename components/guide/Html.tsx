import { sanitizeHtml } from "@/lib/tickets/sanitize";

/** Authored HTML from a definition, sanitised, in the Field guide's type. */
export function Html({ html, className = "", inline = false }: { html: string; className?: string; inline?: boolean }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return inline ? (
    <span className={`fg-html ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
  ) : (
    <div className={`fg-html ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}

/** The small capitals label used above cards and folds. */
export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`fg-ui fg-soft text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}>{children}</div>;
}
