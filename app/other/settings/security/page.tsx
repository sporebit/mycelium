"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Factor } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Mono } from "@/components/dashboard/Mono";
import { createBrowserClient } from "@/lib/supabase/client";
import { usePasskeySupport } from "@/lib/auth/usePasskeySupport";
import { ApiTokensCard } from "@/components/settings/ApiTokensCard";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

type Session = {
  id: string;
  created_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  is_current: boolean;
};

type Enrolment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

const INPUT =
  "w-full min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm " +
  "placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors";

function describe(err: { message?: string } | null | undefined): string {
  return err?.message ?? "Something went wrong.";
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-v2-md bg-surface-1 p-5">
      <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-4 block">{title}</Mono>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Note({ children, tone = "mid" }: { children: React.ReactNode; tone?: "mid" | "error" | "ok" }) {
  const colour =
    tone === "error" ? "text-v2-error" : tone === "ok" ? "text-ok" : "text-text-mid";
  return <p className={`text-sm ${colour}`}>{children}</p>;
}

/**
 * Settings → Security. Everything about how this account signs in:
 * password, TOTP (mandatory for the instance owner and team owners/admins
 * from Part 4), passkeys, and the sessions that are currently open.
 *
 * All of it talks to Supabase Auth directly with the user's own session.
 * The one server call, my_sessions(), is a SECURITY DEFINER function that
 * only returns the caller's rows. Part 5 adds remote sign-out and the
 * "who has seen my data" log.
 */
export default function SecuritySettingsPage() {
  const params = useSearchParams();
  const mustEnrol = params.get("enrol") === "totp";
  const reauthNext = params.get("reauth") === "1" ? (params.get("next") ?? "/admin") : null;
  const [supabase] = useState(() => createBrowserClient());
  const [email, setEmail] = useState<string | null>(null);
  const [aal, setAal] = useState<string>("aal1");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const passkeysSupported = usePasskeySupport();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [{ data: userData }, { data: level }, { data: factorData }, pk, rpc] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.passkey.list().catch(() => ({ data: null })),
        supabase.rpc("my_sessions"),
      ]);
    setEmail(userData.user?.email ?? null);
    setAal(level?.currentLevel ?? "aal1");
    setFactors(factorData?.totp ?? []);
    setPasskeys((pk.data as Passkey[] | null) ?? []);
    setSessions((rpc.data as Session[] | null) ?? []);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  if (!loaded) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Security
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          How this account signs in, and where it is signed in.
        </p>
      </header>

      <Card title="ACCOUNT">
        <div className="flex flex-col gap-1">
          <Label>Email</Label>
          <p className="text-sm text-text-hi">{email ?? "—"}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label>This session</Label>
          <p className="text-sm text-text-mid">
            {aal === "aal2"
              ? "Verified with a second factor."
              : "First factor only. Pages that need a second factor will ask for one."}
          </p>
        </div>
        <div>
          <Button size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </Card>

      {mustEnrol && (
        <div className="rounded-v2-md border border-glow/40 bg-surface-1 p-4 text-sm text-text-mid">
          Your role requires an authenticator app. Enrol one below; sign-in will ask for its code from now on.
        </div>
      )}

      {reauthNext && <ReauthCard next={reauthNext} />}

      <PasswordCard supabase={supabase} />

      <TotpCard supabase={supabase} factors={factors} onChange={load} />

      <PasskeysCard
        supabase={supabase}
        passkeys={passkeys}
        supported={passkeysSupported}
        onChange={load}
      />

      {/* Tickets spec §14.4: scoped bearer tokens for the tix CLI and Claude Code */}
      <ApiTokensCard />

      <Card title="SESSIONS">
        {sessions.length === 0 ? (
          <Note>No open sessions were returned.</Note>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {sessions.map((s) => (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-hi truncate">
                      {s.user_agent ?? "Unknown client"}
                    </span>
                    {s.is_current && (
                      <span className="text-[10px] uppercase tracking-[0.08em] text-ok">
                        this device
                      </span>
                    )}
                  </div>
                  <Mono className="text-[11px] text-ink-3">
                    {s.ip ?? "?"} · {s.aal ?? "aal1"} · active {when(s.refreshed_at ?? s.created_at)}
                  </Mono>
                </div>
                <Button
                  size="sm"
                  variant={s.is_current ? "ghost" : "danger"}
                  onClick={async () => {
                    const res = await fetch(`/api/auth/sessions/${s.id}`, { method: "DELETE" });
                    if (res.ok && s.is_current) window.location.assign("/login");
                    else await load();
                  }}
                >
                  {s.is_current ? "Sign out" : "Sign out there"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AccessLogCard />

      <DeleteAccountCard email={email} />
    </div>
  );
}

type Client = ReturnType<typeof createBrowserClient>;

/**
 * Re-authentication for sensitive pages (Part 5): a fresh TOTP code sets a
 * ten-minute cookie the middleware demands on /admin and /api/account.
 */
function ReauthCard({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
    setBusy(false);
    if (!res.ok) {
      if (j.reason === "mfa_required") {
        const back = `/other/settings/security?reauth=1&next=${encodeURIComponent(next)}`;
        return window.location.assign(`/login?step=mfa&next=${encodeURIComponent(back)}`);
      }
      return setErr(j.error ?? "Not accepted");
    }
    window.location.assign(next);
  }
  return (
    <Card title="CONFIRM IT IS YOU">
      <Note>That page needs your authenticator code again. It stays confirmed for ten minutes.</Note>
      <form onSubmit={submit} className="flex gap-2 items-end">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          placeholder="000000"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${INPUT} max-w-[200px] tracking-[0.3em] text-center font-[family-name:var(--font-mono)]`}
        />
        <Button type="submit" size="sm" variant="primary" loading={busy}>Confirm</Button>
      </form>
      {err && <Note tone="error">{err}</Note>}
    </Card>
  );
}

type AccessEvent = { id: number; at: string; actor_id: string | null; actor_name: string | null; action: string; section: string | null; entity_group: string | null; team_id: string | null; meta: Record<string, unknown> };

/** "Who has seen my data": events where this account is the subject. */
function AccessLogCard() {
  const [events, setEvents] = useState<AccessEvent[] | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/access-log");
      if (cancelled) return;
      if (res.status === 403) {
        setNeedsReauth(true);
        setEvents([]);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { events?: AccessEvent[] };
      if (!cancelled) setEvents(j.events ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Card title="WHO HAS SEEN MY DATA">
      {needsReauth ? (
        <Note>
          Confirm your authenticator to view this.{" "}
          <a className="underline underline-offset-4" href="/other/settings/security?reauth=1&next=%2Fother%2Fsettings%2Fsecurity">Confirm</a>
        </Note>
      ) : events === null ? (
        <Note>Loading…</Note>
      ) : events.length === 0 ? (
        <Note>Nobody has read your data through a team or a grant, and no emergency access has been used.</Note>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {events.map((e) => (
            <li key={e.id} className="py-2 flex flex-col gap-0.5">
              <span className="text-sm text-text-hi">
                {e.actor_name ?? (e.actor_id ? e.actor_id.slice(0, 8) : "system")} · {e.action.replace(/_/g, " ")}
                {e.section ? ` · ${e.section}${e.entity_group ? `.${e.entity_group}` : ""}` : ""}
              </span>
              <Mono className="text-[11px] text-ink-3">{when(e.at)}{typeof e.meta?.path === "string" ? ` · ${e.meta.path}` : ""}</Mono>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Self-service deletion: re-auth (middleware) plus the typed email. */
function DeleteAccountCard({ email }: { email: string | null }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
    setBusy(false);
    if (res.status === 403 && j.reason === "reauth_required") {
      return window.location.assign("/other/settings/security?reauth=1&next=%2Fother%2Fsettings%2Fsecurity");
    }
    if (!res.ok) return setErr(j.error ?? "Could not delete");
    window.location.assign("/login");
  }
  return (
    <Card title="DELETE ACCOUNT">
      <Note>
        Removes your personal space and everything in it, your memberships, grants and invites, and your sign-in.
        Rows you created in a team stay with the team, without your name. This cannot be undone. Export first.
      </Note>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <Label>Type your email to confirm</Label>
          <input className={INPUT} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email ?? ""} />
        </div>
        <Button size="sm" variant="danger" loading={busy} disabled={!email || typed.trim().toLowerCase() !== email.toLowerCase()} onClick={del}>
          Delete my account
        </Button>
      </div>
      {err && <Note tone="error">{err}</Note>}
    </Card>
  );
}


function PasswordCard({ supabase }: { supabase: Client }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: describe(error) });
    setPassword("");
    setMsg({ tone: "ok", text: "Password updated." });
  }

  return (
    <Card title="PASSWORD">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Label>New password</Label>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        <div>
          <Button type="submit" size="sm" variant="primary" loading={busy}>
            Set password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TotpCard({
  supabase,
  factors,
  onChange,
}: {
  supabase: Client;
  factors: Factor[];
  onChange: () => Promise<void>;
}) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const verified = factors.filter((f) => f.status === "verified");

  async function startEnrolment() {
    setBusy(true);
    setMsg(null);
    // A previous abandoned enrolment leaves an unverified factor behind and
    // GoTrue refuses a second with the same name; clear those first.
    for (const f of factors.filter((x) => x.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    setBusy(false);
    if (error || !data) return setMsg({ tone: "error", text: describe(error) });
    setEnrolment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function confirmEnrolment(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolment) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolment.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: describe(error) });
    setEnrolment(null);
    setCode("");
    setMsg({ tone: "ok", text: "Authenticator enrolled. This session is now verified." });
    await onChange();
  }

  async function remove(factorId: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: describe(error) });
    await onChange();
  }

  return (
    <Card title="TWO-FACTOR (TOTP)">
      {verified.length === 0 && !enrolment && (
        <Note>
          No authenticator app is enrolled. The instance owner and team owners
          or admins must have one.
        </Note>
      )}

      {verified.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline">
          {verified.map((f) => (
            <li key={f.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm text-text-hi">{f.friendly_name || "Authenticator"}</span>
                <Mono className="text-[11px] text-ink-3">enrolled {when(f.created_at)}</Mono>
              </div>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(f.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {enrolment && (
        <form onSubmit={confirmEnrolment} className="flex flex-col gap-3">
          <Note>Scan this with your authenticator app, then enter the code it shows.</Note>
          {/* qr_code is an SVG; supabase-js documents prefixing it this way. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              enrolment.qrCode.startsWith("data:")
                ? enrolment.qrCode
                : `data:image/svg+xml;utf-8,${encodeURIComponent(enrolment.qrCode)}`
            }
            alt="TOTP enrolment QR code"
            width={176}
            height={176}
            className="rounded-v2-sm bg-white p-2 self-start"
          />
          <details className="text-sm text-text-mid">
            <summary className="cursor-pointer">Can&apos;t scan? Show the secret</summary>
            <Mono className="text-xs break-all block mt-2 select-all">{enrolment.secret}</Mono>
          </details>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${INPUT} max-w-[200px] tracking-[0.3em] text-center font-[family-name:var(--font-mono)]`}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={busy}>
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={async () => {
                await supabase.auth.mfa.unenroll({ factorId: enrolment.factorId });
                setEnrolment(null);
                setCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {msg && <Note tone={msg.tone}>{msg.text}</Note>}

      {!enrolment && (
        <div>
          <Button size="sm" loading={busy} onClick={startEnrolment}>
            {verified.length > 0 ? "Enrol another authenticator" : "Enrol an authenticator"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PasskeysCard({
  supabase,
  passkeys,
  supported,
  onChange,
}: {
  supabase: Client;
  passkeys: Passkey[];
  supported: boolean;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function register() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: describe(error) });
    setMsg({ tone: "ok", text: "Passkey saved." });
    await onChange();
  }

  async function remove(passkeyId: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: describe(error) });
    await onChange();
  }

  return (
    <Card title="PASSKEYS">
      {!supported && <Note>This browser does not support passkeys.</Note>}
      {passkeys.length === 0 ? (
        <Note>No passkeys yet. A passkey signs you in with this device&apos;s unlock.</Note>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {passkeys.map((p) => (
            <li key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm text-text-hi">{p.friendly_name || "Passkey"}</span>
                <Mono className="text-[11px] text-ink-3">
                  added {when(p.created_at)}
                  {p.last_used_at ? ` · last used ${when(p.last_used_at)}` : ""}
                </Mono>
              </div>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(p.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <div>
        <Button size="sm" loading={busy} disabled={!supported} onClick={register}>
          Add a passkey
        </Button>
      </div>
    </Card>
  );
}
