"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";

type Settings = Record<string, unknown>;
type Stats = Record<string, { label: string; count: number }>;

function Toast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-md bg-ok/20 text-ok text-xs font-[family-name:var(--font-mono)] tracking-[0.1em] transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      SAVED
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const [sr, str] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/settings/stats", { cache: "no-store" }),
      ]);
      if (sr.ok) {
        const j = await sr.json();
        setSettings(j.settings);
      }
      if (str.ok) {
        const j = await str.json();
        setStats(j.stats);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [load]);

  async function patch(fields: Record<string, unknown>) {
    setSettings((prev) => (prev ? { ...prev, ...fields } : prev));
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      clearTimeout(toastTimer.current);
      setToast(true);
      toastTimer.current = setTimeout(() => setToast(false), 1500);
    } catch { /* noop */ }
  }

  if (!settings) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Settings
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Configure your Mycelium experience.
        </p>
      </header>

      <ProfileSection settings={settings} onPatch={patch} />
      <AppearanceSection settings={settings} onPatch={patch} />
      <NotificationsSection settings={settings} onPatch={patch} />
      <IntegrationsSection settings={settings} onPatch={patch} />
      <FeatureFlagsSection settings={settings} onPatch={patch} />
      <CaptureSourcesSection settings={settings} onPatch={patch} />
      <AIConfigSection settings={settings} onPatch={patch} />
      <DataSection stats={stats} />
      <DangerZoneSection />

      <Toast visible={toast} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-ink-1 p-5">
      <Mono className="text-[11px] text-ink-3 tracking-[0.18em] mb-4">{title}</Mono>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function TextSetting({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) setDraft(value); })();
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <label className="text-xs text-text-1 sm:w-48 shrink-0">{label}</label>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); }}
        className="flex-1 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
      />
    </div>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <label className="text-xs text-text-1 sm:w-48 shrink-0">{label}</label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="flex-1 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-0">{label}</div>
        {description && (
          <div className="text-xs text-ink-3 mt-0.5">{description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!value)}
        className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
          value ? "bg-ok" : "bg-ink-3"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function ProfileSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  return (
    <SectionCard title="PROFILE">
      <TextSetting
        label="Display name"
        value={String(settings.display_name ?? "")}
        onSave={(v) => onPatch({ display_name: v })}
      />
      <SelectSetting
        label="Timezone"
        value={String(settings.timezone ?? "Europe/London")}
        options={[
          { value: "Europe/London", label: "Europe/London (GMT/BST)" },
          { value: "Europe/Paris", label: "Europe/Paris (CET)" },
          { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
          { value: "America/New_York", label: "America/New_York (EST)" },
          { value: "America/Chicago", label: "America/Chicago (CST)" },
          { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
          { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
          { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
        ]}
        onSave={(v) => onPatch({ timezone: v })}
      />
      <SelectSetting
        label="Date format"
        value={String(settings.date_format ?? "DD/MM/YYYY")}
        options={[
          { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
          { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
          { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
        ]}
        onSave={(v) => onPatch({ date_format: v })}
      />
      <SelectSetting
        label="Currency"
        value={String(settings.currency ?? "GBP")}
        options={[
          { value: "GBP", label: "GBP (£)" },
          { value: "USD", label: "USD ($)" },
          { value: "EUR", label: "EUR (€)" },
        ]}
        onSave={(v) => onPatch({ currency: v })}
      />
      <SelectSetting
        label="Default landing page"
        value={String(settings.default_landing_page ?? "/")}
        options={[
          { value: "/", label: "Dashboard" },
          { value: "/organisation", label: "Organisation" },
          { value: "/fitness", label: "Fitness" },
          { value: "/health", label: "Health" },
          { value: "/finance", label: "Finance" },
          { value: "/the-boys", label: "The Boys" },
          { value: "/studio", label: "Studio" },
          { value: "/ventures", label: "Ventures" },
        ]}
        onSave={(v) => onPatch({ default_landing_page: v })}
      />
    </SectionCard>
  );
}

function AppearanceSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  return (
    <SectionCard title="APPEARANCE">
      <ToggleSetting
        label="Dashboard layout locked"
        description="Prevents accidental card moves on the dashboard"
        value={!!settings.dashboard_layout_locked}
        onToggle={(v) => onPatch({ dashboard_layout_locked: v })}
      />
    </SectionCard>
  );
}

function NotificationsSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  return (
    <SectionCard title="NOTIFICATIONS">
      <ToggleSetting
        label="Telegram notifications"
        value={!!settings.telegram_enabled}
        onToggle={(v) => onPatch({ telegram_enabled: v })}
      />
      {!!settings.telegram_enabled && (
        <TextSetting
          label="Telegram chat ID"
          value={String(settings.telegram_chat_id ?? "")}
          onSave={(v) => onPatch({ telegram_chat_id: v })}
        />
      )}
      <ToggleSetting
        label="Push notifications"
        value={!!settings.push_notifications_enabled}
        onToggle={(v) => onPatch({ push_notifications_enabled: v })}
      />
      <ToggleSetting
        label="Morning briefing"
        value={!!settings.morning_briefing_enabled}
        onToggle={(v) => onPatch({ morning_briefing_enabled: v })}
      />
      {!!settings.morning_briefing_enabled && (
        <TextSetting
          label="Briefing time"
          value={String(settings.morning_briefing_time ?? "08:00")}
          onSave={(v) => onPatch({ morning_briefing_time: v })}
          type="time"
        />
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <label className="text-xs text-text-1 sm:w-48 shrink-0">
          Reminder lead time
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(settings.reminder_notification_minutes_before ?? 10)}
            onChange={(e) =>
              onPatch({
                reminder_notification_minutes_before: parseInt(e.target.value) || 10,
              })
            }
            className="w-20 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
          />
          <span className="text-xs text-ink-3">minutes before</span>
        </div>
      </div>
    </SectionCard>
  );
}

function IntegrationsSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const googleConnected = !!settings.google_refresh_token;

  async function disconnectGoogle() {
    await onPatch({
      google_refresh_token: null,
      google_access_token: null,
      google_token_expires_at: null,
    });
  }

  return (
    <SectionCard title="INTEGRATIONS">
      <IntegrationRow
        name="Google Calendar"
        description={googleConnected ? "OAuth write access" : "Reading iCal feeds"}
        status={googleConnected ? "Connected" : "Not connected"}
        statusOk={googleConnected}
        action={
          googleConnected ? (
            <button
              type="button"
              onClick={disconnectGoogle}
              className="text-[10px] text-danger hover:underline font-[family-name:var(--font-mono)]"
            >
              DISCONNECT
            </button>
          ) : (
            <Link
              href="/api/google/auth"
              className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
            >
              CONNECT
            </Link>
          )
        }
      />
      <IntegrationRow
        name="Spotify"
        description="Listening stats and play history"
        status={settings.spotify_connected ? "Connected" : "Disconnected"}
        statusOk={!!settings.spotify_connected}
        action={
          settings.spotify_connected ? (
            <Mono className="text-[10px] text-ink-3">Connected</Mono>
          ) : (
            <Link
              href="/api/spotify/authorize"
              className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
            >
              CONNECT
            </Link>
          )
        }
      />
      <IntegrationRow
        name="Health Auto Export"
        description="Auto-import from Apple Health"
        status={settings.health_auto_export_enabled ? "Enabled" : "Disabled"}
        statusOk={!!settings.health_auto_export_enabled}
      />
      <IntegrationRow
        name="Anthropic API"
        description={`Model: ${settings.anthropic_model ?? "claude-sonnet-4-20250514"}`}
        status="Connected"
        statusOk
      />
      <IntegrationRow
        name="OpenAI (Whisper)"
        description="Voice transcription"
        status="Connected"
        statusOk
      />
    </SectionCard>
  );
}

function IntegrationRow({
  name,
  description,
  status,
  statusOk,
  action,
}: {
  name: string;
  description: string;
  status: string;
  statusOk: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-0">{name}</div>
        <div className="text-xs text-ink-3">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${statusOk ? "bg-ok" : "bg-ink-3"}`}
        />
        <Mono className="text-[10px] text-ink-3">{status}</Mono>
      </div>
      {action}
    </div>
  );
}

function FeatureFlagsSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const flags: { key: string; label: string; description: string }[] = [
    { key: "finance_redaction_default", label: "Finance Redaction", description: "Hide all monetary values by default on load" },
    { key: "voice_capture_enabled", label: "Voice Capture", description: "Enable Telegram and iOS Shortcut voice capture" },
    { key: "ai_categorisation_enabled", label: "AI Spending Categorisation", description: "Automatically categorise transactions using Claude" },
    { key: "barcode_scanning_enabled", label: "Barcode Scanning", description: "Scan product barcodes in nutrition logging" },
    { key: "claude_vision_label_scan_enabled", label: "Vision Label Scan", description: "Use Claude Vision to read nutrition labels from photos" },
    { key: "weight_auto_detection_enabled", label: "Weight Auto-Detection", description: "Detect and log weight from voice captures automatically" },
    { key: "streaming_availability_enabled", label: "Streaming Availability Lookup", description: "Auto-lookup streaming services when adding to watch list" },
  ];

  return (
    <SectionCard title="FEATURE FLAGS">
      {flags.map((f) => (
        <ToggleSetting
          key={f.key}
          label={f.label}
          description={f.description}
          value={!!settings[f.key]}
          onToggle={(v) => onPatch({ [f.key]: v })}
        />
      ))}
    </SectionCard>
  );
}

type SourceConfig = { label: string; icon: string; visible: boolean };

const DEFAULT_SOURCE_CONFIG: Record<string, SourceConfig> = {
  api: { label: "API", icon: "⚡", visible: true },
  telegram: { label: "Telegram", icon: "✈", visible: true },
  web: { label: "Web", icon: "▢", visible: true },
  ios: { label: "iOS", icon: "📱", visible: true },
  shortcut: { label: "Shortcut", icon: "⌘", visible: true },
};

function CaptureSourcesSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const saved = settings.capture_source_labels as Record<string, SourceConfig> | undefined;
  const config: Record<string, SourceConfig> = {};
  for (const [k, v] of Object.entries(DEFAULT_SOURCE_CONFIG)) {
    config[k] = { ...v, ...(saved?.[k] ?? {}) };
  }

  const [drafts, setDrafts] = useState<Record<string, SourceConfig>>(config);

  function save(key: string, field: keyof SourceConfig, value: string | boolean) {
    const updated = { ...drafts, [key]: { ...drafts[key], [field]: value } };
    setDrafts(updated);
    onPatch({ capture_source_labels: updated });
  }

  return (
    <SectionCard title="CAPTURE SOURCES">
      <div className="text-xs text-ink-3 mb-1">
        Customise the icon and label shown for each capture source.
      </div>
      <div className="flex flex-col gap-3">
        {Object.entries(drafts).map(([key, source]) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="text"
              value={source.icon}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], icon: e.target.value } }))}
              onBlur={() => save(key, "icon", drafts[key].icon)}
              className="w-10 bg-ink-0 border border-ink-2 rounded-md text-sm text-center text-text-0 py-1.5 outline-none focus:border-accent"
              title="Icon"
            />
            <input
              type="text"
              value={source.label}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], label: e.target.value } }))}
              onBlur={() => save(key, "label", drafts[key].label)}
              className="flex-1 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-1.5 outline-none focus:border-accent"
              title="Label"
            />
            <Mono className="text-[9px] text-ink-3 w-16 text-right shrink-0">{key}</Mono>
            <button
              type="button"
              onClick={() => save(key, "visible", !source.visible)}
              className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
                source.visible ? "bg-ok" : "bg-ink-3"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  source.visible ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function AIConfigSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const models = [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-20240307", label: "Claude Haiku" },
  ];

  return (
    <SectionCard title="AI CONFIG">
      <SelectSetting
        label="Primary model"
        value={String(settings.anthropic_model ?? "claude-sonnet-4-20250514")}
        options={models}
        onSave={(v) => onPatch({ anthropic_model: v })}
      />
      <SelectSetting
        label="Categorisation model"
        value={String(settings.ai_spending_categorisation_model ?? "claude-haiku-20240307")}
        options={models}
        onSave={(v) => onPatch({ ai_spending_categorisation_model: v })}
      />
      <div className="text-[10px] text-ink-3 italic font-[family-name:var(--font-display)]">
        Model changes take effect on next API call.
      </div>
    </SectionCard>
  );
}

function DataSection({ stats }: { stats: Stats | null }) {
  return (
    <SectionCard title="DATA">
      <Link
        href="/other/export"
        className="text-sm text-accent hover:underline font-[family-name:var(--font-mono)]"
      >
        Export your data →
      </Link>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {Object.values(stats).map((s) => (
            <div key={s.label} className="rounded-md bg-ink-0 px-3 py-2">
              <div className="text-sm text-text-0 font-[family-name:var(--font-display)]">
                {s.count.toLocaleString()}
              </div>
              <Mono className="text-[9px] text-ink-3">{s.label}</Mono>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
        Import history coming soon.
      </div>
    </SectionCard>
  );
}

function DangerZoneSection() {
  const [confirm, setConfirm] = useState<string | null>(null);

  function dangerAction(key: string, action: () => void) {
    if (confirm === key) {
      action();
      setConfirm(null);
    } else {
      setConfirm(key);
      setTimeout(() => setConfirm(null), 3000);
    }
  }

  return (
    <SectionCard title="DANGER ZONE">
      <DangerButton
        label="Reset dashboard layout"
        confirming={confirm === "dashboard"}
        onClick={() =>
          dangerAction("dashboard", () => {
            localStorage.removeItem("dashboard-cards");
            window.location.reload();
          })
        }
      />
      <DangerButton
        label="Clear hidden exercises"
        confirming={confirm === "exercises"}
        onClick={() =>
          dangerAction("exercises", () => {
            localStorage.removeItem("fitness-hidden-exercises");
          })
        }
      />
      <DangerButton
        label="Clear Today hidden sessions"
        confirming={confirm === "today"}
        onClick={() =>
          dangerAction("today", () => {
            localStorage.removeItem("fitness-today-hidden");
          })
        }
      />
    </SectionCard>
  );
}

function DangerButton({
  label,
  confirming,
  onClick,
}: {
  label: string;
  confirming: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-2 rounded-md border text-xs font-[family-name:var(--font-mono)] tracking-[0.08em] transition-colors ${
        confirming
          ? "border-danger bg-danger/10 text-danger"
          : "border-ink-2 text-ink-3 hover:text-danger hover:border-danger/40"
      }`}
    >
      {confirming ? "Click again to confirm" : label}
    </button>
  );
}
