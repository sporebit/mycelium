"use client";

/**
 * The wall (master run §11): one screen in the kitchen, touch first, read
 * from across the room.
 *
 *   unpaired  a keypad for the code shown in Settings → Walls
 *   board     the family: people (numbers and the week), the countdown,
 *             the calendar, weather and bins; a tap on a person asks their PIN
 *   person    that person's day, for ten minutes or two quiet ones
 *   guest     clock, weather, pictures; a long press brings the board back
 *   idle      the ambient plate after three quiet minutes; night dims it
 *
 * Speech: every twenty seconds the wall asks for lines to say (a nudge, a
 * reminder, the morning pick) and says each once; never at night, never
 * while muted. A finished item chimes. Nothing here can show money: there is
 * no finance field in what the wall is given.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { playChime } from "@/components/daily/chime";
import type { HomeItem } from "@/lib/home/contract";
import type { WallGlance, WallPersonView, WallPhoto, WallSaying } from "@/lib/wall/contract";
import { IDLE_AFTER_MS, LOCK_AFTER_MS, REFRESH_EVERY_MS, SAY_EVERY_MS, type WallMode, dimLevel, maySpeak, shouldLock, wallMode } from "@/lib/wall/schedule";
import { pcSpeaker } from "@/lib/speech/client";
import { browserSpeaker, canSpeak, hush, say, setSpeaker } from "@/lib/wall/speak";
import { Ambient, Clock, Guest } from "./Ambient";
import { Board } from "./Board";
import { Keypad } from "./Keypad";
import { PersonView } from "./PersonView";

const PAPER = "#181a16";
const INK = "#ece6d2";
const SERIF = "font-[family-name:var(--font-plate)]";

type View = { kind: "board" } | { kind: "keypad"; uid: string } | { kind: "person"; uid: string } | { kind: "guest" };

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body };
}

export function WallClient({ lockAfterMs = LOCK_AFTER_MS, idleAfterMs = IDLE_AFTER_MS }: { lockAfterMs?: number; idleAfterMs?: number }) {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [glance, setGlance] = useState<WallGlance | null>(null);
  const [photos, setPhotos] = useState<WallPhoto[]>([]);
  const [view, setView] = useState<View>({ kind: "board" });
  const [person, setPerson] = useState<WallPersonView | null>(null);
  const [items, setItems] = useState<HomeItem[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState<WallMode>("active");
  const [voice, setVoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [keypadError, setKeypadError] = useState<string | null>(null);
  // 0 until mounted: the first tick treats the first paint as a touch.
  const lastTouch = useRef(0);
  const viewRef = useRef<View>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    lastTouch.current = Date.now();
    // The PC's voice when it is on (lane E2, through the wall's own route); the browser's own when it is off.
    const before = setSpeaker(pcSpeaker(browserSpeaker, undefined, "/api/wall/speech"));
    return () => {
      setSpeaker(before);
    };
  }, []);
  const activeUid = view.kind === "keypad" || view.kind === "person" ? view.uid : null;

  const touch = useCallback(() => {
    lastTouch.current = Date.now();
    setMode("active");
  }, []);

  const loadGlance = useCallback(async () => {
    const { status, body } = await getJson<WallGlance & { reason?: string }>("/api/wall/glance");
    if (status === 401) {
      setPaired(false);
      return;
    }
    if (status === 200 && body) {
      setPaired(true);
      setGlance(body);
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    const { body } = await getJson<{ photos: WallPhoto[] }>("/api/wall/photos");
    setPhotos(body?.photos ?? []);
  }, []);

  const lock = useCallback(async (tell = true) => {
    hush();
    setPerson(null);
    setItems([]);
    setView({ kind: "board" });
    if (tell) await fetch("/api/wall/lock", { method: "POST" }).catch(() => undefined);
  }, []);

  // First draw, and every five minutes after.
  useEffect(() => {
    // The first draw is a fetch, not a state change: nothing is set until the answer comes.
    const first = setTimeout(() => void loadGlance(), 0);
    const t = setInterval(() => void loadGlance(), REFRESH_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadGlance]);
  useEffect(() => {
    if (!paired) return;
    const t = setTimeout(() => void loadPhotos(), 0);
    return () => clearTimeout(t);
  }, [paired, loadPhotos]);

  // The clock, the mode, and the self-lock, once a second.
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNow(n);
      setMode(wallMode(n, lastTouch.current, idleAfterMs));
      if (viewRef.current.kind === "person" && shouldLock(n, lastTouch.current, lockAfterMs)) void lock();
      if (viewRef.current.kind === "keypad" && shouldLock(n, lastTouch.current, lockAfterMs)) setView({ kind: "board" });
    }, 1000);
    return () => clearInterval(t);
  }, [idleAfterMs, lockAfterMs, lock]);

  // Things to say, every twenty seconds, when the wall may speak.
  useEffect(() => {
    if (!paired) return;
    const t = setInterval(async () => {
      if (!maySpeak(new Date(), voice && canSpeak())) return;
      if (viewRef.current.kind === "guest") return;
      const { body } = await getJson<{ say: WallSaying[] }>("/api/wall/say");
      for (const line of body?.say ?? []) void say(line.text);
    }, SAY_EVERY_MS);
    return () => clearInterval(t);
  }, [paired, voice]);

  async function pair(code: string) {
    setBusy(true);
    setKeypadError(null);
    const res = await fetch("/api/wall/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    setBusy(false);
    if (res.ok) {
      setPaired(true);
      await loadGlance();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setKeypadError(j.error ?? "That code did not work.");
    }
  }

  async function unlock(uid: string, pin: string) {
    setBusy(true);
    setKeypadError(null);
    const res = await fetch("/api/wall/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: uid, pin }) });
    if (!res.ok) {
      setBusy(false);
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setKeypadError(j.error ?? "That did not work.");
      return;
    }
    const { status, body } = await getJson<WallPersonView>("/api/wall/person");
    setBusy(false);
    if (status !== 200 || !body) {
      setKeypadError("The view could not be drawn.");
      return;
    }
    setPerson(body);
    setItems(body.home?.items ?? []);
    setView({ kind: "person", uid });
  }

  async function act(id: string, action: "done" | "start" | "not_now") {
    setBusy(true);
    const res = await fetch(`/api/wall/person/items/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    if (res.status === 401) return void lock(false);
    if (!res.ok) return;
    const today = (await res.json().catch(() => ({}))) as { just_won?: boolean };
    if (action === "done") playChime(!!today.just_won);
    // The view is redrawn from the same contract Home uses rather than mapped here.
    const { status, body } = await getJson<WallPersonView>("/api/wall/person");
    if (status === 200 && body) {
      setPerson(body);
      setItems(body.home?.items ?? []);
    }
    void loadGlance();
  }

  async function briefing() {
    const { status, body } = await getJson<{ say?: string }>("/api/wall/person/briefing");
    if (status === 401) return void lock(false);
    if (body?.say && voice) void say(body.say);
  }

  async function capture(blob: Blob) {
    const form = new FormData();
    form.append("audio", blob, "wall.webm");
    form.append("client_uuid", crypto.randomUUID());
    const res = await fetch("/api/wall/person/capture", { method: "POST", body: form });
    if (res.status === 401) return void lock(false);
    if (!res.ok) throw new Error("not saved");
  }

  async function baby(kind: "feed" | "nappy" | "sleep") {
    await fetch("/api/wall/baby-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) }).catch(() => undefined);
    void loadGlance();
  }

  const dim = dimLevel(mode);
  const ambient = mode !== "active" && view.kind !== "guest";
  const seed = (glance?.device.id ?? "wall").split("").reduce((n, c) => n + c.charCodeAt(0), 0);

  return (
    <div
      className={`fixed inset-0 select-none overflow-hidden ${SERIF}`}
      style={{ background: PAPER, color: INK, filter: `brightness(${dim})`, transition: "filter 2s ease" }}
      onPointerDown={touch}
      onKeyDown={touch}
      data-testid="wall"
      data-mode={mode}
      data-view={view.kind}
    >
      {paired === null ? (
        <div className="flex h-full items-center justify-center text-2xl opacity-60">…</div>
      ) : !paired ? (
        <div className="flex h-full flex-col items-center justify-center gap-10">
          <Clock now={now} big={false} />
          <Keypad length={8} title="Pair this wall" hint="The code is in Settings → Security → Walls" busy={busy} error={keypadError} onSubmit={pair} />
        </div>
      ) : view.kind === "guest" ? (
        <Guest now={now} weather={glance?.weather ?? null} photos={photos} onLeave={() => setView({ kind: "board" })} />
      ) : ambient ? (
        <Ambient now={now} seed={seed} weather={glance?.weather ?? null} photos={photos} night={mode === "night"} />
      ) : (
        <div className="flex h-full flex-col gap-6 p-10">
          <header className="flex items-start justify-between">
            <div className="flex items-end gap-8">
              <Clock now={now} big={false} />
              {glance?.weather ? (
                <div className="pb-1 text-xl opacity-70" aria-label="Weather">
                  {glance.weather.conditions} · {Math.round(glance.weather.hi)}° / {Math.round(glance.weather.lo)}°
                </div>
              ) : null}
              {glance?.bins ? (
                <div className="pb-1 text-xl opacity-70" aria-label="Bins">
                  {glance.bins.days === 0 ? "Bins today" : glance.bins.days === 1 ? "Bins tomorrow" : `Bins in ${glance.bins.days} days`} · {glance.bins.label}
                </div>
              ) : null}
            </div>
            <nav className="flex items-center gap-2" aria-label="Who">
              <button type="button" onClick={() => void lock()} className="rounded-full px-4 py-2 text-lg" style={{ background: view.kind === "board" ? "rgba(236,230,210,0.14)" : "transparent" }} aria-pressed={view.kind === "board"}>
                Family
              </button>
              {(glance?.people ?? []).filter((p) => p.can_unlock).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (view.kind === "person" && view.uid === p.id) return;
                    setKeypadError(null);
                    setView({ kind: "keypad", uid: p.id });
                  }}
                  className="rounded-full px-4 py-2 text-lg"
                  style={{ background: activeUid === p.id ? "rgba(236,230,210,0.14)" : "transparent" }}
                  aria-pressed={activeUid === p.id}
                >
                  {p.name}
                </button>
              ))}
              <button type="button" onClick={() => void lock().then(() => setView({ kind: "guest" }))} className="ml-4 rounded-full border px-4 py-2 text-lg opacity-70" style={{ borderColor: "rgba(236,230,210,0.3)" }}>
                Guest
              </button>
              <button type="button" onClick={() => { setVoice((v) => !v); hush(); }} className="rounded-full px-3 py-2 text-lg opacity-60" aria-pressed={!voice} aria-label="Mute the voice">
                {voice ? "Voice on" : "Muted"}
              </button>
            </nav>
          </header>
          <main className="min-h-0 flex-1">
            {view.kind === "keypad" ? (
              <div className="flex h-full items-center justify-center">
                <Keypad length={8} min={4} title="Your PIN" busy={busy} error={keypadError} onSubmit={(pin) => void unlock(view.uid, pin)} onCancel={() => setView({ kind: "board" })} />
              </div>
            ) : view.kind === "person" && person ? (
              <PersonView view={person} items={items} busy={busy} onAct={(id, a) => void act(id, a)} onBriefing={() => void briefing()} onLock={() => void lock()} onCapture={capture} />
            ) : glance ? (
              <Board glance={glance} onOpen={(uid) => { setKeypadError(null); setView({ kind: "keypad", uid }); }} onBaby={(k) => void baby(k)} />
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
