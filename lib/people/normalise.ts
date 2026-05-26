/**
 * Trim + title-case the first letter of each whitespace-separated chunk.
 * "luke" → "Luke", "my mum" → "My Mum", "  jamie  " → "Jamie".
 *
 * Aliases are stored verbatim, but lookups always normalise both sides so
 * "luke", "Luke", "  LUKE " all match the same row.
 */
export function normaliseAlias(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) =>
      w.length === 0 ? "" : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

/** Lowercased canonical for ILIKE lookups. */
export function aliasKey(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Bounded Levenshtein — returns Infinity if the distance is known to exceed
 * `max`. Faster than computing the full matrix and discarding it.
 */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return Infinity;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}
