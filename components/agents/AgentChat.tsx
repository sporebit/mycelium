"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type Agent = {
  id: string;
  display_name: string;
  tagline: string;
  accent_colour: string;
};

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type Toast = { kind: "success" | "error"; text: string } | null;

export function AgentChat({
  agentId,
  initialQuery,
}: {
  agentId: string;
  initialQuery?: string | null;
}) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didAutoSubmit = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data: { agent: Agent; messages: Message[] }) => {
        setAgent(data.agent);
        setMessages(data.messages ?? []);
        setLoading(false);
        scrollToBottom();
      })
      .catch(() => setLoading(false));
  }, [agentId, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      setSending(true);
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: text.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput("");
      scrollToBottom();

      try {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });
        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok || !data.reply) {
          setToast({ kind: "error", text: data.error ?? "Failed to get response" });
          return;
        }
        const assistantMsg: Message = {
          id: `resp-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        scrollToBottom();
      } catch (err) {
        setToast({
          kind: "error",
          text: err instanceof Error ? err.message : "Network error",
        });
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [agentId, sending, scrollToBottom],
  );

  useEffect(() => {
    if (initialQuery && !loading && !didAutoSubmit.current) {
      didAutoSubmit.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, loading, sendMessage]);

  async function endSession() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/end-session`, { method: "POST" });
      if (res.ok) {
        setToast({ kind: "success", text: "Session saved to memory" });
        setMessages([]);
      } else {
        setToast({ kind: "error", text: "Failed to end session" });
      }
    } catch {
      setToast({ kind: "error", text: "Network error" });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const colour = agent?.accent_colour ?? "var(--accent)";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-ink-2/40 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-[family-name:var(--font-mono)]"
            style={{ backgroundColor: `${colour}26`, color: colour }}
          >
            {(agent?.display_name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic truncate">
              {agent?.display_name ?? agentId}
            </h1>
            <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] truncate">
              {agent?.tagline ?? ""}
            </p>
          </div>
          {agentId === "da_boi" && (
            <span className="flex items-center gap-1.5 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
              <span
                className="inline-block h-2 w-2 rounded-full animate-pulse"
                style={{ backgroundColor: colour }}
              />
              reading your data
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={endSession}
          disabled={sending || messages.length === 0}
          className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase transition-colors"
        >
          END SESSION
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
        {messages.length === 0 && !sending && (
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
            Start a conversation with {agent?.display_name ?? "the agent"}.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-ink-2 text-ink-4"
                  : "bg-ink-1 text-ink-4 border border-ink-2 font-[family-name:var(--font-mono)]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-ink-1 border border-ink-2 rounded-xl px-4 py-3 text-sm text-ink-3 italic">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-ink-2/40 pt-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${agent?.display_name ?? "agent"}…`}
          rows={1}
          disabled={sending}
          className="flex-1 bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2.5 outline-none focus:border-ink-3 placeholder:text-ink-3 resize-none"
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          className="px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          SEND
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
