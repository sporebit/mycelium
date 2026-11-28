"use client";

import { useState } from "react";
import { copyLabel } from "./text";
import type { StepBlock } from "@/lib/tickets/steps";

/** An exact command, value or prompt with a copy button that says which (design §2.1). */
export function CopyBlock({ label, text, kind, html }: { label?: string; text: string; kind?: StepBlock["kind"]; html?: string }) {
  const [copied, setCopied] = useState(false);
  const button = copyLabel(kind);
  return (
    <div className="fg-inset overflow-hidden rounded-lg">
      <div className="fg-ui fg-soft flex items-center justify-between gap-3 px-3 pt-2 text-[12px]">
        <span>{label ?? (kind === "value" ? "Value" : kind === "prompt" ? "Prompt" : kind === "command" ? "Command" : "")}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="fg-btn-quiet fg-noprint min-h-[32px] rounded-md px-2"
          aria-label={`${button}: ${label ?? text.slice(0, 40)}`}
        >
          {copied ? "Copied" : button}
        </button>
      </div>
      {html ? (
        <div className="fg-mono fg-html px-3 pb-3 pt-1 text-[13px] [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="fg-mono overflow-x-auto whitespace-pre-wrap px-3 pb-3 pt-1 text-[13px] [overflow-wrap:anywhere]">{text}</pre>
      )}
    </div>
  );
}
