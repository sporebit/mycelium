"use client";

import { useState } from "react";

export function ShoppingListModal({
  items,
  listId,
  onClose,
}: {
  items: { amount: string; unit: string | null; name: string }[];
  listId: string | null;
  onClose: () => void;
}) {
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);

  async function sendToTelegram() {
    if (!listId) return;
    setSendingTelegram(true);
    try {
      const res = await fetch(`/api/health/shopping-lists/${listId}/send-telegram`, {
        method: "POST",
      });
      if (res.ok) setTelegramSent(true);
    } finally {
      setSendingTelegram(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
          Shopping List
        </h2>

        <div className="flex flex-col gap-1 mb-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm">
              <span className="text-ink-4 font-[family-name:var(--font-mono)] font-bold">
                {item.amount}{item.unit ? ` ${item.unit}` : ""}
              </span>
              <span className="text-ink-4 font-[family-name:var(--font-display)]">
                {item.name}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={sendToTelegram}
            disabled={sendingTelegram || telegramSent}
            className="flex-1 py-2 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-40 transition-colors"
          >
            {telegramSent ? "✓ SENT TO TELEGRAM" : sendingTelegram ? "SENDING…" : "SEND TO TELEGRAM"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
