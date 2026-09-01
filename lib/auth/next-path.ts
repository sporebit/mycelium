/**
 * Sanitises the post-login `next` target.
 *
 * `next` reaches us from the query string, which middleware.ts sets on its
 * redirect but which anyone can also write by hand. It is fed straight into a
 * navigation on success, so an unchecked value is an open redirect: a link to
 * `/login?next=https://evil.example/` would bounce a freshly authenticated
 * session off-site, carrying the login page as its Referer.
 *
 * Only same-origin absolute paths survive. Everything else collapses to "/".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Must be an absolute path on this origin.
  if (!raw.startsWith("/")) return "/";
  // "//evil.example" is protocol-relative and resolves off-origin. Browsers
  // normalise backslashes to forward slashes in the authority position, so
  // "/\evil.example" and "/\\evil.example" reach the same place.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
