import Link from "next/link";
import { Shell } from "@/components/dashboard/Shell";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IntegrationState = "connected" | "configured" | "missing" | "future";

type Integration = {
  key: string;
  name: string;
  icon: string;
  state: IntegrationState;
  description: string;
  lastSync?: string | null;
  setupHref?: string;
};

function statePill(state: IntegrationState): { label: string; tone: string } {
  switch (state) {
    case "connected":
      return { label: "● CONNECTED", tone: "border-ok/40 bg-ok/15 text-ok" };
    case "configured":
      return {
        label: "● CONFIGURED",
        tone: "border-accent/40 bg-accent/15 text-accent",
      };
    case "missing":
      return {
        label: "○ NOT CONNECTED",
        tone: "border-ink-3 text-ink-3 bg-ink-0/40",
      };
    case "future":
      return {
        label: "○ COMING SOON",
        tone: "border-ink-3 text-ink-3 bg-ink-0/40 opacity-70",
      };
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso.slice(0, 10);
  }
}

async function loadIntegrations(): Promise<Integration[]> {
  const out: Integration[] = [];

  // Telegram — env presence + most recent raw_captures row from source=telegram
  const telegramConfigured =
    !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.USER_ID;
  let telegramLastSync: string | null = null;
  let appleHealthLastSync: string | null = null;
  let shortcutLastSync: string | null = null;
  try {
    const supabase = createServerClient();
    const uid = process.env.USER_ID;
    if (uid) {
      const { data: tg } = await supabase
        .from("raw_captures")
        .select("created_at")
        .eq("user_id", uid)
        .eq("source", "telegram")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      telegramLastSync = (tg?.created_at as string | null) ?? null;

      const { data: sc } = await supabase
        .from("raw_captures")
        .select("created_at")
        .eq("user_id", uid)
        .eq("source", "api")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      shortcutLastSync = (sc?.created_at as string | null) ?? null;

      const { data: bm } = await supabase
        .from("body_metrics")
        .select("recorded_at, source")
        .eq("user_id", uid)
        .eq("source", "apple_health")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      appleHealthLastSync = (bm?.recorded_at as string | null) ?? null;
    }
  } catch (err) {
    console.error("[/stroma/integrations] supabase status fetch failed:", err);
  }

  out.push({
    key: "telegram",
    name: "Telegram bot",
    icon: "✈",
    state: telegramConfigured ? "connected" : "missing",
    description:
      "Capture text + voice via Telegram. Pain logs, journals, purchases and workouts all route through the same chat.",
    lastSync: telegramLastSync,
  });

  out.push({
    key: "ios_shortcut_capture",
    name: "iOS Shortcut · Capture",
    icon: "▣",
    state: shortcutLastSync ? "connected" : "configured",
    description:
      "One-tap voice capture from the iPhone Action Button. Posts audio to /api/capture-audio.",
    lastSync: shortcutLastSync,
    setupHref: "/fitness/shortcut-setup",
  });

  out.push({
    key: "ios_shortcut_body",
    name: "iOS Shortcut · Body metrics",
    icon: "⚖",
    state: appleHealthLastSync ? "connected" : "configured",
    description:
      "Reads the latest weight + body composition values from HealthKit and posts to /api/health/body-metrics.",
    lastSync: appleHealthLastSync,
    setupHref: "/stroma/integrations/body-shortcut",
  });

  out.push({
    key: "apple_health",
    name: "Apple Health",
    icon: "♡",
    state: appleHealthLastSync ? "connected" : "missing",
    description:
      "Synced via the body-metrics Shortcut above. No direct Apple Health webhook — HealthKit doesn't allow it.",
    lastSync: appleHealthLastSync,
  });

  out.push({
    key: "coinbase",
    name: "Coinbase",
    icon: "₿",
    state: "future",
    description: "Crypto holdings + portfolio value into Finance Pulse.",
  });

  out.push({
    key: "revolut_stocks",
    name: "Revolut Stocks",
    icon: "$",
    state: "future",
    description: "Equity holdings + total portfolio value into Finance Pulse.",
  });

  return out;
}

export default async function IntegrationsPage() {
  const integrations = await loadIntegrations();
  return (
    <Shell active="STROMA">
      <StromaSubNav />
      <div className="flex flex-col gap-4 max-w-3xl">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
            Integrations
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            External systems feeding the network. Status is read from
            environment config + the most recent row each source touched.
          </p>
        </header>

        <ul className="flex flex-col gap-3">
          {integrations.map((i) => {
            const pill = statePill(i.state);
            return (
              <li key={i.key}>
                <Panel borderless>
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden
                      className="shrink-0 h-10 w-10 rounded-md border border-ink-2 bg-ink-0/40 flex items-center justify-center text-base text-text-0"
                    >
                      {i.icon}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-base text-text-0">{i.name}</h2>
                        <span
                          className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-2 py-0.5 rounded-md border ${pill.tone}`}
                        >
                          {pill.label}
                        </span>
                      </div>
                      <p className="text-[13px] text-ink-3 leading-snug">
                        {i.description}
                      </p>
                      <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
                        <Mono className="text-[10px] text-ink-3">
                          Last sync · {fmtTime(i.lastSync)}
                        </Mono>
                        {i.setupHref && i.state !== "future" && (
                          <Link
                            href={i.setupHref}
                            className="text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-accent hover:text-glow-1"
                          >
                            Setup guide →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}
