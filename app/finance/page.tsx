import { Shell } from "@/components/dashboard/Shell";

export default function FinancePage() {
  return (
    <Shell active="FINANCE">
      <div className="flex items-center justify-center min-h-[60vh] text-ink-3">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]">
            Finance
          </div>
          <div className="mt-2 text-sm italic font-[family-name:var(--font-display)] text-ink-4">
            [Coming soon]
          </div>
        </div>
      </div>
    </Shell>
  );
}
