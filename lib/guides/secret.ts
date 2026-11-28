/**
 * The secret guard on every Field guide answer box (design §1 D6, §2.3).
 * A guide never stores a key, token, password or private key: an answer
 * that looks like one is refused before it is saved, and refused again on
 * the way out into the downloadable file. Isomorphic and pure.
 */

export const SECRET_REFUSAL =
  "That looks like a secret. Guides never store secrets; put it where the step says and tick the step.";

/** Prefixes that real keys and tokens start with. */
const PREFIXES: RegExp[] = [
  /^sk-[A-Za-z0-9_-]{8,}/, // OpenAI, Anthropic and friends
  /^ghp_[A-Za-z0-9]{8,}/, // GitHub personal token
  /^gho_[A-Za-z0-9]{8,}/, // GitHub OAuth token
  /^mtk_[A-Za-z0-9_-]{6,}/, // Mycelium API token
  /^xox[abprs]-[A-Za-z0-9-]{6,}/, // Slack
  /^AKIA[A-Z0-9]{12,}/, // AWS access key id
  /^eyJ[A-Za-z0-9_-]{10,}/, // a JWT
];

/** One whitespace-free token: does it look like a key? */
function tokenLooksSecret(t: string): boolean {
  if (PREFIXES.some((re) => re.test(t))) return true;
  // A long URL is not a key (a token inside one is caught by the hex rule).
  if (/^https?:\/\//i.test(t)) return false;
  return t.length >= 24 && /^[A-Za-z0-9_\-+=/]+$/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t) && /\d/.test(t);
}

/** True when a value looks like a key, token, password or private key. */
export function isSecretLike(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (v.includes("-----BEGIN")) return true;
  if (/[0-9a-fA-F]{32,}/.test(v)) return true;
  return v.split(/\s+/).some(tokenLooksSecret);
}
