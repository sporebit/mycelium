import { NextRequest, NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME, signToken } from "@/lib/auth/cookie";
import { safeNextPath } from "@/lib/auth/next-path";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

/**
 * The login form posts here directly, so this route answers two callers:
 *
 * - The hydrated client sends JSON and reads `{ ok: true }` / `{ error }`.
 * - A native form submit — the browser's own POST, before React has hydrated
 *   or with JS off entirely — sends form-encoded fields and needs a 303 back
 *   to a page. Without this branch the form had no `action`, so a pre-hydration
 *   submit performed a native GET and wrote the dashboard password into the
 *   URL, where it reaches the access log, the browser history and the Referer
 *   of the next request out.
 *
 * The form branch never echoes the password back in any form: a failure
 * carries only `error=1`.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data");

  let password = "";
  let next = "/";

  if (isFormPost) {
    const form = await req.formData().catch(() => null);
    password = String(form?.get("password") ?? "");
    const rawNext = form?.get("next");
    next = safeNextPath(typeof rawNext === "string" ? rawNext : null);
  } else {
    const body = await req.json().catch(() => ({ password: "" }));
    password = String(body?.password ?? "");
  }

  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || !timingSafeEqual(password, expected)) {
    if (isFormPost) {
      const back = new URL("/login", req.nextUrl.origin);
      back.searchParams.set("next", next);
      back.searchParams.set("error", "1");
      return NextResponse.redirect(back, 303);
    }
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const payload = JSON.stringify({ authed: true, ts: Date.now() });
  const token = await signToken(payload);

  // 303 so the browser follows a POST with a GET.
  const res = isFormPost
    ? NextResponse.redirect(new URL(next, req.nextUrl.origin), 303)
    : NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
