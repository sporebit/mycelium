"use client";

import { useEffect, useRef, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type VoiceState = "listening" | "thinking" | "speaking";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 2500;

export function VoiceChatOverlay({
  agentId,
  agentName,
  accentColour,
  onClose,
}: {
  agentId: string;
  agentName: string;
  accentColour: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<VoiceState>("listening");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(true);
  const animFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const agentIdRef = useRef(agentId);
  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);

  function cleanupAudio() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }

  async function getAudioContext(): Promise<AudioContext> {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  async function startListening() {
    if (!activeRef.current) return;
    cleanupAudio();
    setState("listening");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const audioCtx = await getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      recorderRef.current = recorder;

      const floatData = new Float32Array(analyser.fftSize);
      let silenceStart: number | null = null;

      function checkSilence() {
        if (!activeRef.current || recorderRef.current?.state !== "recording") return;

        analyser.getFloatTimeDomainData(floatData);
        let rms = 0;
        for (let i = 0; i < floatData.length; i++) rms += floatData[i] * floatData[i];
        rms = Math.sqrt(rms / floatData.length);

        if (rms < SILENCE_THRESHOLD) {
          if (silenceStart === null) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
            onSilenceDetected(mimeType);
            return;
          }
        } else {
          silenceStart = null;
        }

        silenceTimerRef.current = setTimeout(checkSilence, 100);
      }

      silenceTimerRef.current = setTimeout(checkSilence, 800);
    } catch {
      setError("Microphone access denied");
    }
  }

  async function onSilenceDetected(mimeType: string) {
    if (!activeRef.current) return;

    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;

    await new Promise((r) => setTimeout(r, 200));

    const blob = new Blob(chunksRef.current, { type: mimeType });
    if (blob.size < 1000) {
      if (activeRef.current) startListening();
      return;
    }

    setState("thinking");

    try {
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `voice-chat.${ext}`);
      const transcribeRes = await fetch("/api/capture-audio", {
        method: "POST",
        body: fd,
      });
      const transcribeData = await transcribeRes.json();

      if (!transcribeData.transcription || !activeRef.current) {
        if (activeRef.current) startListening();
        return;
      }

      const userText: string = transcribeData.transcription;
      setTranscript((prev) => [...prev, { role: "user", text: userText }]);

      const agentRes = await fetch(`/api/agents/${agentIdRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });
      const agentData = await agentRes.json();

      if (!activeRef.current) return;

      const replyText: string = agentData.reply ?? "I couldn't process that.";
      setTranscript((prev) => [...prev, { role: "assistant", text: replyText }]);

      setState("speaking");
      await speakResponse(replyText);

      if (activeRef.current) startListening();
    } catch {
      setError("Something went wrong");
      if (activeRef.current) setTimeout(() => startListening(), 1500);
    }
  }

  async function speakResponse(text: string) {
    try {
      const res = await fetch("/api/agents/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, agentId: agentIdRef.current }),
      });

      if (!res.ok || !activeRef.current) return;

      const arrayBuffer = await res.arrayBuffer();
      if (!activeRef.current) return;

      const audioCtx = await getAudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyserRef.current = analyser;

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });

      analyserRef.current = null;
    } catch {
      // TTS failed — continue loop silently
    }
  }

  // Start the voice loop on mount
  useEffect(() => {
    activeRef.current = true;
    const frame = requestAnimationFrame(() => {
      if (activeRef.current) startListening();
    });
    return () => {
      cancelAnimationFrame(frame);
      activeRef.current = false;
      cleanupAudio();
      cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // Waveform animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const barCount = 48;
    const gap = 2;
    const w = 360;
    const h = 96;
    const barWidth = (w - gap * (barCount - 1)) / barCount;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        const step = Math.max(1, Math.floor(bufferLength / barCount));

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] / 255;
          const barH = Math.max(3, val * h * 0.85);
          ctx.globalAlpha = val > 0.15 ? 0.8 : 0.25;
          ctx.fillStyle = accentColour;
          ctx.beginPath();
          const x = i * (barWidth + gap);
          ctx.roundRect(x, (h - barH) / 2, barWidth, barH, 2);
          ctx.fill();
        }
      } else {
        const t = Date.now() / 1000;
        for (let i = 0; i < barCount; i++) {
          const phase = (i / barCount) * Math.PI * 3;
          const val = 0.12 + 0.08 * Math.sin(t * 2.5 + phase);
          const barH = Math.max(3, val * h);
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = accentColour;
          ctx.beginPath();
          const x = i * (barWidth + gap);
          ctx.roundRect(x, (h - barH) / 2, barWidth, barH, 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [accentColour, state]);

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcript]);

  function handleClose() {
    activeRef.current = false;
    cleanupAudio();
    onClose();
  }

  const stateLabel =
    state === "listening"
      ? "LISTENING..."
      : state === "thinking"
        ? "THINKING..."
        : "SPEAKING...";

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex flex-col items-center">
      {/* Header */}
      <div className="pt-16 pb-6 text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full text-xl font-[family-name:var(--font-mono)] mb-3"
          style={{ backgroundColor: `${accentColour}26`, color: accentColour }}
        >
          {agentName[0]?.toUpperCase() ?? "?"}
        </div>
        <h2 className="text-xl text-white font-[family-name:var(--font-display)] italic">
          {agentName}
        </h2>
        <Mono
          className="text-[10px] mt-2 tracking-[0.25em]"
          style={{ color: accentColour }}
        >
          {stateLabel}
        </Mono>
      </div>

      {/* Waveform */}
      <div className="flex-shrink-0 flex items-center justify-center py-6">
        <canvas
          ref={canvasRef}
          width={360}
          height={96}
          className="w-[360px] h-24"
        />
      </div>

      {/* Error */}
      {error && (
        <Mono className="text-[10px] text-danger mb-2">{error}</Mono>
      )}

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 w-full max-w-lg overflow-y-auto px-6 flex flex-col gap-3 min-h-0"
      >
        {transcript.map((entry, i) => (
          <div
            key={i}
            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                entry.role === "user"
                  ? "bg-white/10 text-white/80"
                  : "text-white/90 border border-white/10"
              }`}
            >
              {entry.text}
            </div>
          </div>
        ))}
      </div>

      {/* End call */}
      <div className="flex-shrink-0 pb-12 pt-6">
        <button
          type="button"
          onClick={handleClose}
          className="w-16 h-16 rounded-full bg-danger/90 hover:bg-danger flex items-center justify-center transition-colors shadow-lg shadow-danger/30"
          aria-label="End voice chat"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}
