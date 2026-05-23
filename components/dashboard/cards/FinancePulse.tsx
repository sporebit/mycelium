import { Panel } from "../Panel";
import { Mono } from "../Mono";

export function FinancePulse() {
  return (
    <Panel
      number="07"
      title="FINANCE PULSE"
      status="LIVE"
      statusTone="ok"
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Net worth
        </div>
        <Mono className="block text-2xl text-ink-4 mt-1">$[NET WORTH]</Mono>
      </div>

      {/* Sparkline placeholder */}
      <div className="mt-3 h-12 rounded-lg border border-ink-2 bg-ink-0/40 relative overflow-hidden">
        <svg
          viewBox="0 0 200 48"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,32 L20,28 L40,30 L60,22 L80,26 L100,18 L120,22 L140,16 L160,20 L180,12 L200,14 L200,48 L0,48 Z"
            fill="url(#spark)"
          />
          <path
            d="M0,32 L20,28 L40,30 L60,22 L80,26 L100,18 L120,22 L140,16 L160,20 L180,12 L200,14"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Daily
          </div>
          <Mono className="block text-sm text-ok mt-1">+$[DAY]</Mono>
          <Mono className="block text-[11px] text-ok/70">+X.XX%</Mono>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Monthly
          </div>
          <Mono className="block text-sm text-ok mt-1">+$[MONTH]</Mono>
          <Mono className="block text-[11px] text-ok/70">+X.XX%</Mono>
        </div>
      </div>
    </Panel>
  );
}
