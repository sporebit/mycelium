"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Mono } from "@/components/dashboard/Mono";
import type { AgentVoice, VoiceOption, VoiceProvider } from "@/lib/agents/voice";

/**
 * Voice & manner for one agent (MYC-149): pick a voice (your own clones,
 * ElevenLabs, OpenAI), hear it, write how the agent should talk, and clone
 * your own voice from a recording made here or a file you upload.
 */

type VoicesResponse = { elevenlabs: boolean; options: VoiceOption[]; agents: Record<string, AgentVoice> };

const SAMPLE_LINES = [
  "Right then. Two things for today, then we're done.",
  "Booked for ten tomorrow. Want me to move the gym to the evening?",
  "That's about forty quid over the month so far. Nothing to worry about.",
];

const STYLE_PLACEHOLDER =
  "e.g. Dry Yorkshire humour, short sentences, never says 'great question'. Calls me Phil. Swears a bit when I've skipped the gym.";

export function AgentVoiceSheet({
  agentId,
  agentName,
  open,
  onClose,
  onSaved,
}: {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
  onSaved: (voice: AgentVoice) => void;
}) {
  const [data, setData] = useState<VoicesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<VoiceProvider>("openai");
  const [voiceId, setVoiceId] = useState("");
  const [style, setStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // clone
  const [cloneName, setCloneName] = useState("");
  const [samples, setSamples] = useState<Array<{ blob: Blob; name: string }>>([]);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [cloning, setCloning] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/agents/voices")
      .then((r) => r.json())
      .then((j: VoicesResponse & { error?: string }) => {
        if (cancelled) return;
        if (j.error) {
          setLoadError(j.error);
          return;
        }
        setLoadError(null);
        setData(j);
        const mine = j.agents[agentId];
        if (mine) {
          setProvider(mine.provider);
          setVoiceId(mine.voice_id);
          setStyle(mine.speaking_style ?? "");
        }
      })
      .catch(() => !cancelled && setLoadError("Could not load voices"));
    return () => {
      cancelled = true;
      previewAudioRef.current?.pause();
      stopRecording();
    };
  }, [open, agentId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  async function preview(v: VoiceOption) {
    previewAudioRef.current?.pause();
    setPreviewing(v.voice_id);
    try {
      const line = SAMPLE_LINES[Math.floor(Math.random() * SAMPLE_LINES.length)];
      const res = await fetch("/api/agents/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line, voice: { provider: v.provider, voice_id: v.voice_id } }),
      });
      if (!res.ok) throw new Error("preview failed");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreviewing((p) => (p === v.voice_id ? null : p));
      };
      await audio.play();
    } catch {
      setNotice("Could not play a preview");
      setPreviewing(null);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const option = data?.options.find((o) => o.provider === provider && o.voice_id === voiceId);
      const res = await fetch(`/api/agents/${agentId}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, voice_id: voiceId, voice_name: option?.name ?? null, speaking_style: style.trim() || null }),
      });
      const j = (await res.json()) as { voice?: AgentVoice; error?: string };
      if (!res.ok || !j.voice) {
        setNotice(j.error ?? "Save failed");
        return;
      }
      onSaved(j.voice);
      setNotice("Saved");
    } catch {
      setNotice("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mimeType });
        if (blob.size > 1000) {
          const ext = mimeType.includes("mp4") ? "m4a" : "webm";
          setSamples((prev) => [...prev, { blob, name: `recording-${prev.length + 1}.${ext}` }]);
        }
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      setNotice("Microphone access denied");
    }
  }

  function stopRecording() {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    setRecording(false);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setSamples((prev) => [...prev, ...Array.from(list).map((f) => ({ blob: f, name: f.name }))]);
  }

  async function createClone() {
    const name = cloneName.trim();
    if (!name || samples.length === 0 || cloning) return;
    setCloning(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("description", "Cloned in Mycelium");
      for (const s of samples) fd.append("files", s.blob, s.name);
      const res = await fetch("/api/agents/voices", { method: "POST", body: fd });
      const j = (await res.json()) as { voice?: VoiceOption; error?: string };
      if (!res.ok || !j.voice) {
        setNotice(j.error ?? "Clone failed");
        return;
      }
      const created = j.voice;
      setData((d) => (d ? { ...d, options: [created, ...d.options] } : d));
      setProvider("elevenlabs");
      setVoiceId(created.voice_id);
      setSamples([]);
      setCloneName("");
      setNotice(`"${created.name}" is ready — save to use it`);
    } catch {
      setNotice("Clone failed");
    } finally {
      setCloning(false);
    }
  }

  async function removeClone(v: VoiceOption) {
    if (!confirm(`Delete the voice "${v.name}"? Any agent using it goes back to a stock voice.`)) return;
    const res = await fetch(`/api/agents/voices/${encodeURIComponent(v.voice_id)}`, { method: "DELETE" });
    if (!res.ok) {
      setNotice("Delete failed");
      return;
    }
    setData((d) => (d ? { ...d, options: d.options.filter((o) => o.voice_id !== v.voice_id) } : d));
    if (voiceId === v.voice_id) {
      const fallback = data?.agents[agentId];
      setProvider("openai");
      setVoiceId(fallback?.provider === "openai" ? fallback.voice_id : "alloy");
    }
  }

  const options = data?.options ?? [];
  const groups: Array<{ label: string; items: VoiceOption[]; removable?: boolean }> = [
    { label: "Your voices", items: options.filter((o) => o.provider === "elevenlabs" && o.cloned), removable: true },
    { label: "ElevenLabs", items: options.filter((o) => o.provider === "elevenlabs" && !o.cloned) },
    { label: "OpenAI", items: options.filter((o) => o.provider === "openai") },
  ].filter((g) => g.items.length > 0);

  const btn = "px-3 py-1.5 rounded-v2-md border border-hairline text-ink-3 hover:text-ink-4 hover:border-ink-3 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase transition-colors";

  return (
    <Sheet open={open} onClose={onClose} title={`${agentName} — voice & manner`} side="auto">
      <div className="flex flex-col gap-6 pt-2 pb-6">
        {loadError && <Mono className="text-[10px] text-danger">{loadError}</Mono>}
        {!data && !loadError && <Mono className="text-[10px] text-ink-3">Loading voices…</Mono>}

        {data && !data.elevenlabs && (
          <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            ElevenLabs voices and cloning need ELEVENLABS_API_KEY on the server. OpenAI&apos;s stock voices work now.
          </p>
        )}

        {/* Voice picker */}
        {groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-1.5">
            <Mono className="text-[10px] text-ink-3 tracking-[0.18em] uppercase">{g.label}</Mono>
            <ul className="flex flex-col gap-1">
              {g.items.map((v) => {
                const selected = v.provider === provider && v.voice_id === voiceId;
                return (
                  <li key={`${v.provider}:${v.voice_id}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProvider(v.provider);
                        setVoiceId(v.voice_id);
                      }}
                      className={`flex-1 min-w-0 text-left px-3 py-2 rounded-v2-md border text-sm transition-colors ${
                        selected ? "border-accent/60 bg-accent/10 text-ink-4" : "border-hairline text-ink-3 hover:text-ink-4 hover:border-ink-3"
                      }`}
                    >
                      <span className="block truncate">{v.name}</span>
                      {v.description && <span className="block text-[11px] text-ink-3 truncate">{v.description}</span>}
                    </button>
                    <button type="button" onClick={() => preview(v)} disabled={previewing === v.voice_id} className={btn} aria-label={`Preview ${v.name}`}>
                      {previewing === v.voice_id ? "…" : "▶"}
                    </button>
                    {g.removable && (
                      <button type="button" onClick={() => removeClone(v)} className={btn} aria-label={`Delete ${v.name}`}>
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* Manner */}
        <section className="flex flex-col gap-1.5">
          <Mono className="text-[10px] text-ink-3 tracking-[0.18em] uppercase">How {agentName} talks</Mono>
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value.slice(0, 1200))}
            placeholder={STYLE_PLACEHOLDER}
            rows={4}
            className="bg-surface-0 border border-hairline rounded-v2-md text-sm text-ink-4 px-3 py-2.5 outline-none focus:border-ink-3 placeholder:text-ink-3 resize-y"
          />
          <p className="text-[11px] text-ink-3">
            Goes into every reply, typed or spoken. Leave it empty for the agent&apos;s own manner.
          </p>
        </section>

        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving || !voiceId} className="px-4 py-2 rounded-v2-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]">
            {saving ? "SAVING…" : "SAVE"}
          </button>
          {notice && <Mono className="text-[10px] text-ink-3">{notice}</Mono>}
        </div>

        {/* Clone */}
        {data?.elevenlabs && (
          <section className="flex flex-col gap-2 border-t border-hairline pt-4">
            <Mono className="text-[10px] text-ink-3 tracking-[0.18em] uppercase">Clone your voice</Mono>
            <p className="text-[11px] text-ink-3">
              Your own voice only. Record a minute or two of natural speech here, or upload a recording you made.
            </p>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value.slice(0, 60))}
              placeholder="Voice name, e.g. Phil"
              className="bg-surface-0 border border-hairline rounded-v2-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={recording ? stopRecording : startRecording} className={`${btn} ${recording ? "text-danger border-danger/40" : ""}`}>
                {recording ? `■ STOP ${recSeconds}s` : "● RECORD"}
              </button>
              <label className={`${btn} cursor-pointer`}>
                UPLOAD
                <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
              <button type="button" onClick={createClone} disabled={cloning || !cloneName.trim() || samples.length === 0} className={btn}>
                {cloning ? "CLONING…" : "CREATE VOICE"}
              </button>
            </div>
            {samples.length > 0 && (
              <ul className="flex flex-col gap-1">
                {samples.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[11px] text-ink-3 font-[family-name:var(--font-mono)]">
                    <span className="truncate">{s.name} · {Math.round(s.blob.size / 1024)} KB</span>
                    <button type="button" onClick={() => setSamples((prev) => prev.filter((_, j) => j !== i))} className="text-ink-3 hover:text-danger" aria-label={`Remove ${s.name}`}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
