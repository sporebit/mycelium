import type { ReadonlyURLSearchParams } from "next/navigation";

type RouterLike = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * Write a single key into the URL's query string via router.replace (no
 * history entry, no scroll-to-top). Pass `null` to remove the key — keeps
 * the URL clean when a control is back at its default.
 */
export function updateUrlParam(
  router: RouterLike,
  pathname: string,
  searchParams: ReadonlyURLSearchParams | URLSearchParams | null,
  key: string,
  value: string | null
): void {
  const params = new URLSearchParams(searchParams?.toString() ?? "");
  if (value === null || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const qs = params.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
}

/**
 * Pick a value from searchParams, validating it against a whitelist.
 * Returns the fallback when missing or not on the list.
 */
export function pickParam<T extends string>(
  searchParams: ReadonlyURLSearchParams | URLSearchParams | null,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = searchParams?.get(key);
  if (raw && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return fallback;
}
