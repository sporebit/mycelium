"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Surface } from "@/components/ui/Surface";
import { safeNextPath } from "@/lib/auth/next-path";
import { usePasskeySupport } from "@/lib/auth/usePasskeySupport";
import { createBrowserClient } from "@/lib/supabase/client";

type Step = "methods" | "sent" | "mfa";

const INPUT =
  "w-full min-h-[44px] px-4 rounded-v2-md bg-surface-0 border border-hairline text-text-hi " +
  "placeholder:text-text-lo font-[family-name:var(--font-inter-tight)] " +
  "focus:outline-none focus:border-glow transition-colors";

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Request a new one.",
};

function describe(err: { message?: string } | null | undefined): string {
  if (!err?.message) return "Something went wrong. Try again.";
  return err.message;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [supabase] = useState(() => createBrowserClient());

  const [step, setStep] = useState<Step>(
    searchParams.get("step") === "mfa" ? "mfa" : "methods",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    ERRORS[searchParams.get("error") ?? ""] ?? "",
  );
  const passkeysSupported = usePasskeySupport();

  // Every email link and OAuth redirect comes back through the callback
  // route, which sets the session cookies server-side and then honours next.
  const callbackUrl = () =>
    `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`;

  /**
   * After any first factor: users with a verified TOTP factor must present
   * it before the session is worth anything to the middleware (aal2 routes)
   * and to the policy that makes TOTP mandatory for owners and admins.
   */
  async function afterFirstFactor() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
      setStep("mfa");
      setBusy(false);
      return;
    }
    // No verified factor yet: roles that require one (instance owner, team
    // owners and admins — Part 4) are sent to enrol before anything else.
    if (data && data.nextLevel !== "aal2") {
      const { data: required } = await supabase.rpc("requires_totp");
      if (required === true) {
        window.location.assign(`/other/settings/security?enrol=totp&next=${encodeURIComponent(next)}`);
        return;
      }
    }
    window.location.assign(next);
  }

  // Magic link and password go through the server so they can be rate
  // limited (Part 5); the server sets the session cookies.
  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; mfaRequired?: boolean; enrolRequired?: boolean; locked?: boolean };
    return { ok: res.ok, status: res.status, ...json };
  }

  // A secondary route for anyone without a password: the same email field,
  // a sign-in link instead.
  async function sendMagicLink() {
    if (!email) return setError("Enter your email first, then ask for a link.");
    setBusy(true);
    setError("");
    const r = await post("/api/auth/magic-link", { email, next });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not send the link");
    setStep("sent");
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/auth/password", { email, password });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error ?? "Sign-in failed");
    }
    if (r.mfaRequired) {
      setStep("mfa");
      setBusy(false);
      return;
    }
    if (r.enrolRequired) {
      window.location.assign(`/other/settings/security?enrol=totp&next=${encodeURIComponent(next)}`);
      return;
    }
    window.location.assign(next);
  }

  async function signInWithPasskey() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) {
      setBusy(false);
      return setError(describe(error));
    }
    await afterFirstFactor();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setBusy(false);
      setError(describe(error));
    }
  }

  async function verifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    // Verified on the server so failures count towards the lockout (Part 5).
    const r = await post("/api/auth/mfa/verify", { code: code.trim() });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error ?? "That code was not accepted");
    }
    window.location.assign(next);
  }

  if (step === "sent") {
    return (
      <div className="flex flex-col gap-3">
        <Label>Check your email</Label>
        <p className="text-sm text-text-mid">
          A sign-in link is on its way to <span className="text-text-hi">{email}</span>.
          It works once and expires soon.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setStep("methods");
            setError("");
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  if (step === "mfa") {
    return (
      <form onSubmit={verifyTotp} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label>Second factor</Label>
          <p className="text-sm text-text-mid">
            Enter the six-digit code from your authenticator app.
          </p>
        </div>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          placeholder="000000"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${INPUT} tracking-[0.3em] text-center font-[family-name:var(--font-mono)]`}
        />
        {error && <p className="text-sm text-v2-error">{error}</p>}
        <Button type="submit" variant="primary" loading={busy}>
          Verify
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
        <Label>Email</Label>
        <input
          name="email"
          type="email"
          autoComplete="username webauthn"
          placeholder="you@example.com"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
        <Label>Password</Label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        {error && <p className="text-sm text-v2-error">{error}</p>}
        <Button type="submit" variant="primary" loading={busy}>
          Sign in
        </Button>
        <button
          type="button"
          onClick={() => void sendMagicLink()}
          disabled={busy}
          className="self-center text-xs text-text-lo underline-offset-4 hover:text-text-mid hover:underline disabled:opacity-50"
        >
          No password? Email me a sign-in link
        </button>
      </form>

      <div className="flex items-center gap-3 text-text-lo">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[11px] uppercase tracking-[0.08em]">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" onClick={signInWithGoogle} disabled={busy}>
          Continue with Google
        </Button>
        <Button
          type="button"
          onClick={signInWithPasskey}
          disabled={busy || !passkeysSupported}
          title={passkeysSupported ? undefined : "This browser does not support passkeys"}
        >
          Sign in with a passkey
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface-0 px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-hi tracking-tight">
          Myphelium2
        </h1>
        <Surface level={1} radius="lg" border className="w-full p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </Surface>
        <p className="text-xs text-text-lo text-center">
          Invitation only. There is nothing to sign up for.
        </p>
      </div>
    </main>
  );
}
