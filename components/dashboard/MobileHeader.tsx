import Link from "next/link";

/**
 * Slim mobile header: M wordmark left, settings/customize cog right.
 *
 * Renders below 768px; desktop continues to use the full TopRail. The
 * spore-dot uses the same .spore-pulse animation as the desktop wordmark.
 */
export function MobileHeader() {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-ink-1/85 backdrop-blur-xl shadow-[0_1px_0_0_var(--ink-2)]">
      <div className="flex items-center justify-between px-4 h-12">
        <Link
          href="/"
          aria-label="Mycelium — home"
          className="inline-flex items-center text-sm font-[family-name:var(--font-display)] font-medium uppercase tracking-[0.04em] text-text-0"
        >
          <span aria-hidden>M</span>
          <span
            aria-hidden
            className="ml-2 inline-block align-middle"
            style={{ width: 8, height: 8 }}
          >
            <svg
              viewBox="0 0 8 8"
              width={8}
              height={8}
              className="spore-pulse"
            >
              <circle cx="4" cy="4" r="4" fill="var(--glow-0)" />
            </svg>
          </span>
        </Link>

        <Link
          href="/more"
          aria-label="Settings and more"
          className="inline-flex items-center justify-center h-10 w-10 -mr-2 rounded-md text-ink-3 hover:text-ink-4"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
