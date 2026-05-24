"use client";

import { usePrivacy } from "@/lib/context/PrivacyContext";

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function PrivacyToggle() {
  const { financeHidden, toggle } = usePrivacy();
  const label = financeHidden
    ? "Show financial values"
    : "Hide financial values";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={financeHidden}
      className={`hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors ${
        financeHidden
          ? "text-accent hover:text-accent/80"
          : "text-ink-3 hover:text-ink-4"
      }`}
    >
      {financeHidden ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}
