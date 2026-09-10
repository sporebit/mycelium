import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth/next-path";

const OTP_TYPES: readonly EmailOtpType[] = [
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
  "email",
];

/**
 * Where every email link and OAuth redirect lands. Two shapes arrive:
 *
 *  - `?code=…` — the PKCE code from a magic link or Google sign-in started
 *    by the browser client, which stored the verifier in a cookie. Exchanged
 *    for a session here so the session cookies are set server-side.
 *  - `?token_hash=…&type=…` — an email link whose template links straight
 *    here with {{ .TokenHash }}. Needs no verifier, so it works from any
 *    browser or device, which is why the checklist asks Phil to set the
 *    hosted templates this way.
 *
 * On success the session cookies are written onto the redirect and the
 * browser lands on `next` (sanitised; same-origin paths only). On failure
 * the browser goes back to /login with a fixed error code, never the token.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const res = NextResponse.redirect(new URL(next, url.origin), 303);
  const supabase = createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let failed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    failed = Boolean(error);
  } else {
    failed = true;
  }

  if (failed) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("next", next);
    back.searchParams.set("error", "link");
    return NextResponse.redirect(back, 303);
  }
  return res;
}
