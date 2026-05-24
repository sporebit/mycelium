import { SuggestCapture } from "@/components/crm/SuggestCapture";

export default function CRMDecisionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center max-w-md">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Decisions
          </div>
          <div className="mt-2 text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
            Not yet implemented
          </div>
          <p className="mt-3 text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
            A log of decisions, the context around them, and what changed.
            Capture one below — the classifier will route it as a decision.
          </p>
        </div>
      </div>
      <div className="max-w-2xl w-full mx-auto">
        <SuggestCapture
          label="Decision"
          prefix="[decision]"
        />
      </div>
    </div>
  );
}
