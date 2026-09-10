"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Surface } from "@/components/ui/Surface";
import { safeNextPath } from "@/lib/auth/next-path";
import { usePasskeySupport } from "@/lib/auth/usePasskeySupport";
import { createBrowserClient } from "@/lib/supabase/client";

type Method = "magic" | "password" | "passkey";
type Step = "methods" | "sent" | "mfa";

const METHODS: { value: Method; label: string }[] = [
  { value: "magic", label: "Magic link" },
  { value: "password", label: "Password" },
  { value: "passkey", label: "Passkey" },
];

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

  const [method, setMethod] = useState<Method>("magic");
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

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: false },
    });
    setBusy(false);
    if (error) return setError(describe(error));
    setStep("sent");
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return setError(describe(error));
    }
    await afterFirstFactor();
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
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (listError || !factor) {
      setBusy(false);
      return setError(
        listError ? describe(listError) : "No authenticator is enrolled on this account.",
      );
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: code.trim(),
    });
    if (error) {
      setBusy(false);
      return setError(describe(error));
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
          Use another method
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
      <SegmentedControl
        options={METHODS}
        value={method}
        onChange={(v) => {
          setMethod(v as Method);
          setError("");
        }}
        ariaLabel="Sign-in method"
      />

      {method === "magic" && (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <Label>Email</Label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
          {error && <p className="text-sm text-v2-error">{error}</p>}
          <Button type="submit" variant="primary" loading={busy}>
            Email me a link
          </Button>
        </form>
      )}

      {method === "password" && (
        <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
          <Label>Email</Label>
          <input
            name="email"
            type="email"
            autoComplete="username"
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
        </form>
      )}

      {method === "passkey" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-mid">
            Use a passkey saved on this device or in your password manager.
          </p>
          {!passkeysSupported && (
            <p className="text-sm text-text-lo">
              This browser does not support passkeys.
            </p>
          )}
          {error && <p className="text-sm text-v2-error">{error}</p>}
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={!passkeysSupported}
            onClick={signInWithPasskey}
          >
            Continue with passkey
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 text-text-lo">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[11px] uppercase tracking-[0.08em]">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <Button type="button" onClick={signInWithGoogle} disabled={busy}>
        Continue with Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface-0 px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0 tracking-tight">
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
