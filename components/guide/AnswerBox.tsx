"use client";

import { useState } from "react";
import { isSecretLike, SECRET_REFUSAL } from "@/lib/guides/secret";

/**
 * An answer box with the secret guard (D6): a value shaped like a key,
 * token, password or private key is refused before it is saved, and the
 * box is cleared so it does not sit on the screen.
 */
export function AnswerBox({
  label,
  placeholder,
  value,
  onSave,
  id,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onSave: (v: string) => void;
  id?: string;
}) {
  const [refused, setRefused] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span className="fg-ui fg-soft text-[12px]">{label}</span>
      <input
        id={id}
        className="fg-input fg-mono min-h-[40px] rounded-md px-3 text-[14px]"
        defaultValue={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={() => refused && setRefused(false)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (isSecretLike(v)) {
            e.target.value = value;
            setRefused(true);
            return;
          }
          if (v !== value) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-invalid={refused || undefined}
      />
      {refused && (
        <span role="alert" className="fg-ui fg-amber-t text-[13px]">
          {SECRET_REFUSAL}
        </span>
      )}
    </label>
  );
}
