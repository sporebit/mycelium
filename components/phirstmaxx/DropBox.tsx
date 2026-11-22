"use client";

/**
 * The one box (spec §5 "In the app"): paste a link, type a place name, or
 * choose a picture. No form, no required field but one of those. The drop
 * carries a client id made here, so pressing Save twice makes one drop; the
 * server answers 202 at once and the box says "Saved — researching".
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { INPUT, errText } from "./api";

export function DropBox({ onSaved, compact = false }: { onSaved?: (id: string) => void | Promise<unknown>; compact?: boolean }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!text.trim() && !file) {
      setNote({ kind: "error", text: "Paste a link, type a few words, or choose a picture." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const form = new FormData();
      form.set("client_id", clientId.current);
      form.set("source", "app");
      const t = text.trim();
      if (/^https?:\/\/\S+$/i.test(t)) form.set("url", t);
      else if (t) form.set("text", t);
      if (file) form.set("file", file, file.name);
      const res = await fetch("/api/phirstmaxx/drops", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { id?: string; duplicate?: boolean; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "That did not save. Try again.");
      setNote({ kind: "ok", text: json.duplicate ? "Already saved — researching." : "Saved — researching." });
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // the next drop is a new one
      clientId.current = crypto.randomUUID();
      await onSaved?.(json.id);
    } catch (e) {
      // the sender keeps the drop until the server says saved (spec §2.1): the box is left as it was
      setNote({ kind: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      data-testid="pm-dropbox"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${INPUT} min-w-[12rem] flex-1`}
          placeholder={compact ? "Paste a link or a place" : "Paste a link, or type a place name"}
          value={text}
          aria-label="Link or place"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const f = e.clipboardData.files?.[0];
            if (f && f.type.startsWith("image/")) setFile(f);
          }}
        />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {file ? "Change picture" : "Picture"}
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={busy}>
          Save
        </Button>
      </div>
      {file ? <p className="text-xs text-text-lo">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p> : null}
      {note ? (
        <p role={note.kind === "error" ? "alert" : "status"} className={`text-sm ${note.kind === "error" ? "text-v2-error" : "text-glow-2"}`}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
