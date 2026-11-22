"use client";

/**
 * /phirstmaxx/share — where a share lands (spec §5, Android). A GET share
 * (?url=&text=&title=) is saved from here as a drop; a POST share with a
 * file went through /api/phirstmaxx/share first and arrives as ?saved=<id>.
 * Either way the page says "Saved — researching" and links on.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Surface } from "@/components/ui";
import { errText } from "./api";

type Props = { saved: string | null; error: string | null; url: string | null; text: string | null; title: string | null };

export function Share({ saved, error, url, text, title }: Props) {
  const [state, setState] = useState<{ kind: "saving" } | { kind: "saved"; id: string; duplicate: boolean } | { kind: "error"; text: string } | { kind: "empty" }>(() =>
    saved ? { kind: "saved", id: saved, duplicate: false } : error ? { kind: "error", text: error } : url || text || title ? { kind: "saving" } : { kind: "empty" },
  );
  const once = useRef(false);

  useEffect(() => {
    if (state.kind !== "saving" || once.current) return;
    once.current = true;
    // the same share retried lands on the same client id, so it is one drop
    const clientId = `share:${[url, text, title].map((s) => s ?? "").join("|").slice(0, 150)}`;
    fetch("/api/phirstmaxx/drops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: clientId, source: "share_sheet", url, text: [title, text].filter(Boolean).join("\n") || null }) })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { id?: string; duplicate?: boolean; error?: string };
        if (!res.ok || !json.id) throw new Error(json.error ?? "That did not save.");
        setState({ kind: "saved", id: json.id, duplicate: !!json.duplicate });
      })
      .catch((e: unknown) => setState({ kind: "error", text: errText(e) }));
  }, [state.kind, url, text, title]);

  return (
    <Surface className="mx-auto flex max-w-md flex-col gap-3 p-6" data-testid="pm-share">
      {state.kind === "saving" ? <p className="text-base text-text-hi">Saving…</p> : null}
      {state.kind === "saved" ? (
        <>
          <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi">{state.duplicate ? "Already saved" : "Saved"} — researching</h1>
          <p className="text-sm text-text-mid">It will be looked up in the background: where it is, how long to get there, when it is open, and whether it fits a window you are both free.</p>
          <Link href={`/phirstmaxx/things?drop=${state.id}`} className="text-sm text-glow-2 hover:underline">
            See it among the things
          </Link>
        </>
      ) : null}
      {state.kind === "error" ? (
        <>
          <h1 className="text-lg text-text-hi">Not saved</h1>
          <p role="alert" className="text-sm text-v2-error">
            {state.text}
          </p>
          <p className="text-sm text-text-mid">Share it again, or paste it into the box on the PhirstMaxx home page.</p>
        </>
      ) : null}
      {state.kind === "empty" ? <p className="text-sm text-text-mid">Nothing was shared. Share a link or a picture to the app and it lands here.</p> : null}
      <Link href="/phirstmaxx" className="text-sm text-text-lo hover:underline">
        PhirstMaxx home
      </Link>
    </Surface>
  );
}
