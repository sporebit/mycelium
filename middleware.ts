import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "auth-token";

// Public routes that bypass the auth gate entirely
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/telegram/webhook",
  "/api/capture",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function verifyHmac(token: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const [payloadB64, sigHex] = token.split(".");
  if (!payloadB64 || !sigHex) return false;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(
    sigHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );

  return crypto.subtle.verify(
    "HMAC",
    keyMaterial,
    sigBytes,
    new TextEncoder().encode(payloadB64)
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // API secret header — for CLI programmatic access
  const apiSecret = req.headers.get("x-api-secret");
  const expectedApiSecret = process.env.API_SECRET;
  if (
    apiSecret &&
    expectedApiSecret &&
    timingSafeEqual(apiSecret, expectedApiSecret)
  ) {
    return NextResponse.next();
  }

  // Authorization: Bearer ${CRON_SECRET} — used by Vercel scheduled functions
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    authHeader &&
    cronSecret &&
    timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
  ) {
    return NextResponse.next();
  }

  // Cookie-based auth for browser sessions
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verifyHmac(token))) {
    return NextResponse.next();
  }

  // API routes return 401; everything else redirects to /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
