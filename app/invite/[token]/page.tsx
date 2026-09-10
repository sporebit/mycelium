"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Surface } from "@/components/ui/Surface";
import { createBrowserClient } from "@/lib/supabase/client";

type Preview = {
  email: string;
  team_id: string | null;
  team_name: string | null;
  role: string;
  invited_by_name: string | null;
  status: "valid" | "expired" | "accepted";
};

type Accepted = { team_id: string | null; team_slug: string | null; role: string; requires_totp: boolean };

const INPUT =
  "w-full min-h-[44px] px-4 rounded-v2-md bg-surface-0 border border-hairline text-text-hi " +
  "placeholder:text-text-lo font-[family-name:var(--font-inter-tight)] focus:outline-none focus:border-glow transition-colors";

/**
 * /invite/[token]. Public until the invitee has an account: shows who
 * invited them to what, lets them pick how to sign in (magic link, a
 * password, or Google — the auth user is created only now, and only for
 * the invited address), then accepts the invite, which joins the team and
 * seeds their first screen. Admins and owners are sent to enrol TOTP.
 */
function InviteFlow() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const [supabase] = useState(() => createBrowserClient());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [method, setMethod] = useState<"magic" | "password">("magic");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") === "link" ? "That sign-in link has expired. Request another below." : "");
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState<Accepted | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/invites/${token}`);
      if (cancelled) return;
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const j = (await res.json()) as { invite: Preview; signed_in_as: string | null };
      if (cancelled) return;
      setPreview(j.invite);
      setSignedInAs(j.signed_in_as);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const here = () => `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`;

  async function magic() {
    if (!preview) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: preview.email,
      options: { emailRedirectTo: here(), shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: { emailRedirectTo: here() },
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    if (!data.session) {
      // Email confirmation is on for this project: the link comes back here.
      setBusy(false);
      setSent(true);
      return;
    }
    window.location.assign(`/invite/${token}`);
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  async function accept() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/invites/${token}`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as Accepted & { error?: string };
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Could not accept the invite");
    setAccepted(j);
  }

  if (notFound) return <p className="text-sm text-text-mid">This invitation does not exist.</p>;
  if (!preview) return <p className="text-sm text-text-lo">Loading…</p>;

  const heading = preview.team_name ? `Join ${preview.team_name}` : "Join Mycelium";
  const from = preview.invited_by_name ?? "Someone";

  if (accepted) {
    return (
      <div className="flex flex-col gap-4">
        <Label>Welcome</Label>
        <p className="text-sm text-text-mid">
          You are in{preview.team_name ? ` ${preview.team_name}` : ""} as <span className="text-text-hi">{accepted.role}</span>.
          To start with you see Organisation, Fitness and Health; the rest can be turned on in Settings.
        </p>
        {accepted.requires_totp ? (
          <>
            <p className="text-sm text-text-mid">
              Your role requires an authenticator app. Set one up now; you will be asked for it at each sign-in.
            </p>
            <Button variant="primary" onClick={() => window.location.assign("/other/settings/security?enrol=totp")}>
              Set up an authenticator
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => window.location.assign("/")}>
            Open Mycelium
          </Button>
        )}
      </div>
    );
  }

  if (preview.status !== "valid") {
    return (
      <div className="flex flex-col gap-2">
        <Label>{heading}</Label>
        <p className="text-sm text-text-mid">
          {preview.status === "expired" ? "This invitation has expired. Ask for a new one." : "This invitation has already been used."}
        </p>
      </div>
    );
  }

  if (signedInAs) {
    const matches = signedInAs.toLowerCase() === preview.email.toLowerCase();
    return (
      <div className="flex flex-col gap-4">
        <Label>{heading}</Label>
        <p className="text-sm text-text-mid">
          {from} invited <span className="text-text-hi">{preview.email}</span> as <span className="text-text-hi">{preview.role}</span>.
        </p>
        {matches ? (
          <Button variant="primary" loading={busy} onClick={accept}>
            Accept invitation
          </Button>
        ) : (
          <p className="text-sm text-v2-error">
            You are signed in as {signedInAs}, but this invitation is for {preview.email}. Sign out and open the link again.
          </p>
        )}
        {error && <p className="text-sm text-v2-error">{error}</p>}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-2">
        <Label>Check your email</Label>
        <p className="text-sm text-text-mid">
          A sign-in link is on its way to <span className="text-text-hi">{preview.email}</span>. It brings you back here to accept.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Label>{heading}</Label>
        <p className="text-sm text-text-mid">
          {from} invited <span className="text-text-hi">{preview.email}</span> as <span className="text-text-hi">{preview.role}</span>.
          Choose how you will sign in.
        </p>
      </div>
      <SegmentedControl
        options={[
          { value: "magic", label: "Magic link" },
          { value: "password", label: "Password" },
        ]}
        value={method}
        onChange={(v) => setMethod(v as "magic" | "password")}
        ariaLabel="Sign-in method"
      />
      {method === "magic" ? (
        <Button variant="primary" loading={busy} onClick={magic}>
          Email me a sign-in link
        </Button>
      ) : (
        <form onSubmit={withPassword} className="flex flex-col gap-3">
          <Label>Choose a password</Label>
          <input className={INPUT} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy}>
            Create account
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-v2-error">{error}</p>}
      <div className="flex items-center gap-3 text-text-lo">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[11px] uppercase tracking-[0.08em]">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <Button onClick={google} disabled={busy}>
        Continue with Google
      </Button>
      <p className="text-xs text-text-lo">Passkeys can be added under Settings → Security once you are in.</p>
    </div>
  );
}

export default function InvitePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface-0 px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0 tracking-tight">Myphelium2</h1>
        <Surface level={1} radius="lg" border className="w-full p-6">
          <Suspense>
            <InviteFlow />
          </Suspense>
        </Surface>
      </div>
    </main>
  );
}
