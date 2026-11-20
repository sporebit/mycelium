"use client";

import { useEffect } from "react";

/**
 * A page that is already open learns that its session is no longer served.
 *
 * The middleware sends a fresh navigation to the right place, but a page
 * left open keeps calling the API, and each call is refused: the person saw
 * "Could not load…" and grey placeholders with nothing to say why. The
 * refusals carry a reason; this watches for the two that mean "you cannot
 * carry on here" and takes the person where they can act.
 *
 *   401 session_ended   signed out from another device  → sign in
 *   403 enrol_required  a role that needs an authenticator, none set up → set one up
 *
 * One listener on the page's own fetch, so every component is covered
 * without each having to know. It only reads refusals from this site's API.
 */
export function SessionWatch() {
  useEffect(() => {
    const original = window.fetch;
    let leaving = false;

    const go = (reason: string) => {
      const here = window.location.pathname;
      if (reason === "session_ended") {
        if (here === "/login") return;
        leaving = true;
        window.location.assign(`/login?next=${encodeURIComponent(here + window.location.search)}`);
      } else if (reason === "enrol_required") {
        if (here.startsWith("/other/settings/security")) return;
        leaving = true;
        window.location.assign("/other/settings/security?enrol=totp");
      }
    };

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (leaving || (res.status !== 401 && res.status !== 403)) return res;
      try {
        const url = new URL(res.url, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return res;
        const body = (await res.clone().json()) as { reason?: unknown };
        if (body.reason === "session_ended" || body.reason === "enrol_required") go(body.reason);
      } catch {
        /* not JSON, or already read: nothing to learn from it */
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}
