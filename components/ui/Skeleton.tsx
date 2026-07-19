export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative block overflow-hidden bg-surface-2 rounded-v2-sm ${className}`}
    >
      <span
        className="absolute inset-0 -translate-x-full motion-safe:animate-[skeleton-shimmer_1.6s_linear_infinite] motion-reduce:hidden"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--hairline-strong) 50%, transparent 100%)",
        }}
      />
    </span>
  );
}
