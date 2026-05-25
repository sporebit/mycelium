/**
 * Normalise a free-text type label into a snake_case key.
 * Trim, lowercase, strip non-alnum to underscore, collapse repeats.
 */
export function slugifyTypeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
