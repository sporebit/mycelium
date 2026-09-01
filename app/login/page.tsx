"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { safeNextPath } from "@/lib/auth/next-path";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  // A failed native form post comes back as ?error=1 and never carries the
  // submitted password, so the message is fixed here rather than echoed.
  const [error, setError] = useState(
    searchParams.get("error") ? "Invalid password" : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      window.location.href = next;
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Invalid password");
      setLoading(false);
    }
  }

  return (
    // action/method matter even though handleSubmit calls preventDefault: a
    // submit landing before hydration is handled by the browser alone, and an
    // actionless form defaults to a GET of the current URL, which puts the
    // password in the query string. The POST target keeps it in the body.
    <form
      action="/api/auth/login"
      method="post"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-xs"
    >
      <input type="hidden" name="next" value={next} />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        autoFocus
        className="px-4 py-2 rounded bg-ink-1 border border-ink-2 text-ink-4 placeholder:text-ink-3 focus:outline-none focus:border-accent"
      />
      {error && <p className="text-danger text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded bg-accent text-ink-4 font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-ink-0">
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-2xl font-semibold text-ink-4 tracking-tight">
          Myphelium2
        </h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
