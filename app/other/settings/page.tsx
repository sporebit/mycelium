"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveTab } from "@/lib/settings/tabs";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { daylogSettings, type DaylogSettings } from "@/lib/daylog/settings";
import { type DailySettings, mergeDailySettings } from "@/lib/daily/settings";
import { DEFAULT_FREE_MINUTES } from "@/lib/daily/propose";
import { Sheet } from "@/components/ui/Sheet";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { applyTheme, isTheme, type Theme } from "@/lib/theme";
import { SECTIONS } from "@/lib/nav/sections";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { staleness } from "@/lib/family/calendar/map";
import { NotificationSettings } from "@/components/work/NotificationSettings";

type Settings = Record<string, unknown>;
type Stats = Record<string, { label: string; count: number }>;

function Toast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-v2-md bg-ok/20 text-ok text-xs font-[family-name:var(--font-mono)] tracking-[0.1em] transition-all duration-300 ${
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
      <div className="text-sm text-text-lo italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-hi">
          Settings
        </h1>
        <p className="text-sm text-text-lo italic font-[family-name:var(--font-display)]">
          Configure your Myphelium2 experience.
        </p>
      </header>

      <SettingsBody settings={settings} stats={stats} patch={patch} />

      <Toast visible={toast} />
    </div>
  );
}

/**
 * Section navigation. This page carries a lot of content, so rather than one
 * long scroll it is split: a left-anchored list on desktop, and on touch a
 * list of rows that each open their section as a full Sheet.
 *
 * Note this is NOT the same concept as ui_prefs.hidden_sections — that is app
 * navigation. These are the panels within this page.
 */
function SettingsBody(props: { settings: Settings; stats: Stats | null; patch: (f: Record<string, unknown>) => void }) {
  // useSearchParams() wants a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <SettingsPanels {...props} />
    </Suspense>
  );
}

function SettingsPanels({
  settings,
  stats,
  patch,
}: {
  settings: Settings;
  stats: Stats | null;
  patch: (f: Record<string, unknown>) => void;
}) {
  const PANELS: { key: string; label: string; render: () => React.ReactNode }[] = [
    { key: "profile", label: "Profile", render: () => <ProfileSection settings={settings} onPatch={patch} /> },
    { key: "security", label: "Security", render: () => <SecurityLinkSection /> },
    { key: "people", label: "People & teams", render: () => <PeopleLinkSection /> },
    { key: "appearance", label: "Appearance", render: () => <AppearanceSection settings={settings} onPatch={patch} /> },
    { key: "sections", label: "Sections", render: () => <SectionsSection /> },
    { key: "notifications", label: "Notifications", render: () => <NotificationsSection settings={settings} onPatch={patch} /> },
    { key: "integrations", label: "Integrations", render: () => <IntegrationsSection settings={settings} onPatch={patch} /> },
    { key: "features", label: "Features", render: () => <FeatureFlagsSection settings={settings} onPatch={patch} /> },
    { key: "capture", label: "Capture", render: () => <CaptureSourcesSection settings={settings} onPatch={patch} /> },
    { key: "ai", label: "AI", render: () => <AIConfigSection settings={settings} onPatch={patch} /> },
    { key: "today", label: "Today", render: () => <DailySection /> },
    { key: "journal", label: "Journal", render: () => <JournalSection settings={settings} onPatch={patch} /> },
    { key: "data", label: "Data", render: () => <DataSection stats={stats} /> },
    { key: "danger", label: "Danger zone", render: () => <DangerZoneSection /> },
  ];

  // The open panel is in the URL (?tab=), so it survives a reload and can be
  // linked to; landing with no parameter opens the first (MYC-190). On
  // touch the same parameter is the open Sheet.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keys = PANELS.map((x) => x.key);
  // A Google sign-in comes back with ?google=…; that belongs to Integrations even when no tab is named.
  const raw = params.get("tab") ?? (params.get("google") !== null ? "integrations" : null);
  const active = resolveTab(keys, raw);
  const go = (key: string | null) => router.replace(key && key !== keys[0] ? `${pathname}?tab=${key}` : pathname, { scroll: false });
  const setActive = (key: string) => go(key);
  // The Sheet portals out of the page, so it is kept to touch widths here, not by a class.
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const sheetKey = !desktop && raw && keys.includes(raw) ? raw : null;
  const setSheetKey = (key: string | null) => router.replace(key ? `${pathname}?tab=${key}` : pathname, { scroll: false });
  const activePanel = PANELS.find((x) => x.key === active) ?? PANELS[0];
  const sheetPanel = PANELS.find((x) => x.key === sheetKey) ?? null;

  return (
    <>
      {/* Desktop: left-anchored list + content pane */}
      <div className="hidden md:grid md:grid-cols-[180px_1fr] md:gap-6 md:items-start">
        <nav className="flex flex-col gap-0.5 sticky top-4" aria-label="Settings sections">
          {PANELS.map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={() => setActive(panel.key)}
              aria-current={panel.key === active ? "true" : undefined}
              className={`text-left px-3 py-2 rounded-v2-md text-sm transition-colors ${
                panel.key === active
                  ? "bg-surface-2 text-text-hi"
                  : "text-text-lo hover:text-text-hi hover:bg-surface-1"
              }`}
            >
              {panel.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">{activePanel.render()}</div>
      </div>

      {/* Touch: rows that open the section as a Sheet */}
      <div className="md:hidden flex flex-col rounded-v2-lg border border-hairline overflow-hidden">
        {PANELS.map((panel) => (
          <button
            key={panel.key}
            type="button"
            onClick={() => setSheetKey(panel.key)}
            className="flex items-center justify-between px-4 py-3 text-left text-sm text-text-hi bg-surface-1 border-b border-hairline last:border-b-0 active:bg-surface-2 transition-colors"
          >
            {panel.label}
            <span aria-hidden className="text-text-lo">›</span>
          </button>
        ))}
      </div>

      {/* Touch only: on desktop the same ?tab= is the pane, so the Sheet must not open as well. */}
      {sheetPanel && (
        <Sheet open onClose={() => setSheetKey(null)} title={sheetPanel.label} side="auto">
          <div className="pt-2">{sheetPanel.render()}</div>
        </Sheet>
      )}
    </>
  );
}

const WEEKDAYS: Array<[number, string]> = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]];

/**
 * Today and the evening close (master run §6): the times and limits the
 * daily loop runs on, kept in ui_prefs.daily. Anything left alone uses the
 * defaults in lib/daily/settings.ts.
 */
function DailySection() {
  const { prefs, setPrefs } = useUiPrefs();
  const d = mergeDailySettings(prefs.daily);
  const save = (partial: Partial<DailySettings>) => void setPrefs({ daily: { ...d, ...partial } });
  const minutes = (v: string, fallback: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
  };
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="TODAY — WHEN IT SPEAKS">
        <p className="text-sm text-text-lo">
          The morning pick normally comes when the phone&apos;s alarm stops, and the evening close when it goes on charge.
          These are for the days neither happens.
        </p>
        <TextSetting label="Morning pick, if no alarm (London)" value={d.morning_fallback} type="time" onSave={(v) => save({ morning_fallback: v })} />
        <TextSetting label="Evening close, if never plugged in (London)" value={d.evening_fallback} type="time" onSave={(v) => save({ evening_fallback: v })} />
        <TextSetting label="Quiet from" value={d.quiet_from} type="time" onSave={(v) => save({ quiet_from: v })} />
        <TextSetting label="Quiet until" value={d.quiet_to} type="time" onSave={(v) => save({ quiet_to: v })} />
        <TextSetting
          label="Times a day the app may speak first"
          value={String(d.interruption_budget)}
          type="number"
          onSave={(v) => save({ interruption_budget: minutes(v, d.interruption_budget, 10) })}
        />
        <p className="text-[12px] text-text-lo">
          Counted across push, Telegram and the wall together. Replies to something you started, reminders you set, and
          another person&apos;s nudges are not counted. Nothing is sent while a countdown is running.
        </p>
      </SectionCard>
      <SectionCard title="TODAY — HOW MUCH FITS">
        <p className="text-sm text-text-lo">
          Free minutes each day. Today is filled to half of this, with shown times already half as long again as the
          estimate.
        </p>
        {WEEKDAYS.map(([day, name]) => (
          <TextSetting
            key={day}
            label={`${name} (minutes free)`}
            value={String(d.free_minutes[day] ?? DEFAULT_FREE_MINUTES[day])}
            type="number"
            onSave={(v) => save({ free_minutes: { ...d.free_minutes, [day]: minutes(v, DEFAULT_FREE_MINUTES[day], 960) } })}
          />
        ))}
        <TextSetting
          label="Things in progress before it asks to park one"
          value={String(d.wip_limit)}
          type="number"
          onSave={(v) => save({ wip_limit: Math.max(1, minutes(v, d.wip_limit, 10)) })}
        />
        <ToggleSetting label="Sound on Done" description="A short chime when something is finished." value={d.chime} onToggle={(v) => save({ chime: v })} />
      </SectionCard>
      <SectionCard title="THE WEEK — WHEN IT CLOSES">
        <p className="text-sm text-text-lo">
          The weekly close-out is the same slot every week: a forty-five-minute box, the plan said at the start and
          reported at the end. A notice comes ten minutes before.
        </p>
        <div className="flex flex-col gap-1 py-2 text-sm">
          <span className="text-text-mid">Day</span>
          <SegmentedControl
            value={String(d.closeout_day)}
            onChange={(v) => save({ closeout_day: Number(v) })}
            options={WEEKDAYS.map(([day, name]) => ({ value: String(day), label: name.slice(0, 3) }))}
          />
        </div>
        <TextSetting label="Time (London)" value={d.closeout_time} type="time" onSave={(v) => save({ closeout_time: v })} />
      </SectionCard>
    </div>
  );
}

/**
 * Day log (daylog spec §6): behaviour settings in user_settings.daylog —
 * the nightly prompt, snooze, cutoff, turn cap, slot list and score keys.
 */
function JournalSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const d = daylogSettings(settings.daylog);
  const save = (partial: Partial<DaylogSettings>) => onPatch({ daylog: { ...d, ...partial } });
  return (
    <SectionCard title="JOURNAL — DAY LOG">
      <ToggleSetting label="Nightly prompt" description="The bot asks about the day every evening (Talk / Quick / Skip / Snooze)." value={d.enabled} onToggle={(v) => save({ enabled: v })} />
      <TextSetting label="Prompt time (London)" value={d.prompt_time} type="time" onSave={(v) => save({ prompt_time: v })} />
      <TextSetting label="Snooze (minutes)" value={String(d.snooze_minutes)} type="number" onSave={(v) => save({ snooze_minutes: Number(v) || 60 })} />
      <TextSetting label="Cutoff (nothing after)" value={d.cutoff} type="time" onSave={(v) => save({ cutoff: v })} />
      <TextSetting label="Turn cap per night" value={String(d.turn_cap)} type="number" onSave={(v) => save({ turn_cap: Number(v) || 15 })} />
      <TextSetting label="Minimum probes" value={String(d.min_probes)} type="number" onSave={(v) => save({ min_probes: Number(v) || 0 })} />
      <TextSetting label="Slots (comma-separated, in order)" value={d.slots.join(", ")} onSave={(v) => save({ slots: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
      <TextSetting label="Score keys (comma-separated, in order)" value={d.scores.join(", ")} onSave={(v) => save({ scores: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
      <SelectSetting
        label="Voice"
        value={d.persona_agent_id ?? ""}
        options={[
          { value: "da_boi", label: "Da Boi" },
          { value: "", label: "Plain interviewer" },
        ]}
        onSave={(v) => save({ persona_agent_id: v || null })}
      />
      <TextSetting label="Monthly alert (pence)" value={String(d.monthly_alert_pence)} type="number" onSave={(v) => save({ monthly_alert_pence: Number(v) || 0 })} />
    </SectionCard>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-v2-md bg-surface-1 p-5">
      <Mono className="text-[11px] text-text-lo tracking-[0.18em] mb-4">{title}</Mono>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

/**
 * Sign-in methods, TOTP, passkeys and sessions have their own page: they
 * talk to Supabase Auth directly rather than to the settings store this
 * page patches, so they do not belong in the same save loop.
 */
function PeopleLinkSection() {
  return (
    <SectionCard title="PEOPLE & TEAMS">
      <p className="text-sm text-text-lo">
        Teams you belong to, who can see which sections, invitations, and
        what you have shared with a person. Finance is never shared.
      </p>
      <Link
        href="/other/settings/people"
        className="text-sm text-text-hi underline underline-offset-4 hover:text-glow transition-colors"
      >
        Open people &amp; teams ›
      </Link>
    </SectionCard>
  );
}

function SecurityLinkSection() {
  return (
    <SectionCard title="SECURITY">
      <p className="text-sm text-text-lo">
        Password, authenticator app, passkeys and the sessions currently
        signed in to this account.
      </p>
      <Link
        href="/other/settings/security"
        className="text-sm text-text-hi underline underline-offset-4 hover:text-glow transition-colors"
      >
        Open security settings ›
      </Link>
    </SectionCard>
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
      <label className="text-xs text-text-mid sm:w-48 shrink-0">{label}</label>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); }}
        className="flex-1 bg-surface-0 border border-hairline rounded-v2-md text-sm text-text-hi px-3 py-1.5 outline-none focus:border-accent"
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
  const id = useId();
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <label htmlFor={id} className="text-xs text-text-mid sm:w-48 shrink-0">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="flex-1 bg-surface-0 border border-hairline rounded-v2-md text-sm text-text-hi px-3 py-1.5 outline-none focus:border-accent"
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
        <div className="text-sm text-text-hi">{label}</div>
        {description && (
          <div className="text-xs text-text-lo mt-0.5">{description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!value)}
        className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
          value ? "bg-ok" : "bg-text-lo"
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
  // These three live in ui_prefs, not user_settings — different table, so they
  // write through useUiPrefs rather than the page's onPatch.
  const { prefs, setPrefs } = useUiPrefs();
  return (
    <SectionCard title="APPEARANCE">
      <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-text-hi">Theme</div>
          <div className="text-[11px] text-text-lo">
            Dark is loam and glow; light is paper and moss. System follows the device. The sun and moon in the shell flip between the two.
          </div>
        </div>
        <SegmentedControl
          size="sm"
          ariaLabel="Theme"
          value={isTheme(prefs.theme) ? prefs.theme : "dark"}
          onChange={(v) => {
            const theme: Theme = isTheme(v) ? v : "dark";
            applyTheme(theme);
            void setPrefs({ theme });
          }}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-text-hi">Shell</div>
          <div className="text-[11px] text-text-lo">
            New: a top menu bar, and Home as the Specimen plate. Classic: the sidebar and the dashboard. Switch back at any time.
          </div>
        </div>
        <SegmentedControl
          size="sm"
          ariaLabel="Shell"
          value={prefs.shell === "new" ? "new" : "classic"}
          onChange={(v) => {
            // The shell wraps every page: reload so the whole frame is the chosen one.
            void setPrefs({ shell: v === "new" ? "new" : "classic" }).then(() => window.location.reload());
          }}
          options={[
            { value: "classic", label: "Classic" },
            { value: "new", label: "New" },
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-text-hi">Density</div>
          <div className="text-[11px] text-text-lo">
            Compact tightens table rows from 40px to 32px
          </div>
        </div>
        <SegmentedControl
          size="sm"
          ariaLabel="Density"
          value={prefs.density}
          onChange={(v) => void setPrefs({ density: v as "comfortable" | "compact" })}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-text-hi">Motion</div>
          <div className="text-[11px] text-text-lo">
            Reduced shortens transitions; off disables them entirely
          </div>
        </div>
        <SegmentedControl
          size="sm"
          ariaLabel="Motion"
          value={prefs.motion}
          onChange={(v) => void setPrefs({ motion: v as "full" | "reduced" | "off" })}
          options={[
            { value: "full", label: "Full" },
            { value: "reduced", label: "Reduced" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>

      <ToggleSetting
        label="Dashboard layout locked"
        description="Prevents accidental card moves on the dashboard"
        value={!!settings.dashboard_layout_locked}
        onToggle={(v) => onPatch({ dashboard_layout_locked: v })}
      />

      <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-text-hi">Reset dashboard layout</div>
          <div className="text-[11px] text-text-lo">
            Restores the default card order and sizes
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset the dashboard layout to defaults?")) {
              void setPrefs({ dashboard_layout: {} });
            }
          }}
          className="text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-3 py-1.5 rounded-v2-md border border-hairline text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
        >
          Reset
        </button>
      </div>
    </SectionCard>
  );
}

/**
 * hidden_sections is the whole feature-flag system — hiding a section here
 * removes it from the Sidebar, the TabBar and the command palette. Direct
 * URLs still resolve, so nothing becomes unreachable.
 */
function SectionsSection() {
  const { prefs, setPrefs } = useUiPrefs();
  const hidden = new Set(prefs.hidden_sections);
  return (
    <SectionCard title="SECTIONS">
      <p className="text-[11px] text-text-lo pb-1">
        Hidden sections disappear from the sidebar, tab bar and ⌘K search.
        Their pages still open if you navigate straight to them.
      </p>
      <div className="flex flex-col">
        {SECTIONS.map((sec) => {
          const isHidden = hidden.has(sec.key);
          return (
            <label
              key={sec.key}
              className="flex items-center justify-between gap-3 py-2 cursor-pointer"
            >
              <span className="text-sm text-text-hi">{sec.label}</span>
              <input
                type="checkbox"
                checked={!isHidden}
                onChange={() => {
                  const next = new Set(hidden);
                  if (isHidden) next.delete(sec.key);
                  else next.add(sec.key);
                  void setPrefs({ hidden_sections: [...next] });
                }}
                className="accent-[var(--color-accent)] shrink-0"
              />
            </label>
          );
        })}
      </div>
    </SectionCard>
  );
}

function NotificationsSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  return (
    <div className="flex flex-col gap-4">
    <SectionCard title="WORK — MENTIONS, ASSIGNMENTS, STATUS, COMMENTS">
      <NotificationSettings />
    </SectionCard>
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
        <label className="text-xs text-text-mid sm:w-48 shrink-0">
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
            className="w-20 bg-surface-0 border border-hairline rounded-v2-md text-sm text-text-hi px-3 py-1.5 outline-none focus:border-accent"
          />
          <span className="text-xs text-text-lo">minutes before</span>
        </div>
      </div>
    </SectionCard>
    </div>
  );
}

/** What the Google callback sends back in `?google=` (app/api/google/callback), in words. */
const GOOGLE_FLAGS: Record<string, string> = {
  connected: "Google connected.",
  not_allowed: "That Google account isn't allowed here. Only the account named in GOOGLE_ALLOWED_ACCOUNTS on the server can connect; nothing was stored.",
  no_code: "Google sent no sign-in code. Try again.",
  bad_state: "Sign-in expired, try again. (The sign-in took more than ten minutes, or came back to a different browser from the one that started it.)",
  no_account: "Google did not say which account that was, so nothing was stored. Try again.",
  denied: "Google sign-in was cancelled.",
  exchange_failed: "Google refused the sign-in code. Try again; if it keeps happening the client secret on the server may be wrong.",
  config_error: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing on the server.",
  error: "Google sign-in failed. Try again.",
};

/**
 * The line for `?google=`: the connected address when there is one to name,
 * and on a refusal the address that was turned away (`?account=`, sent by the
 * callback only for not_allowed).
 */
function googleNoticeFor(flag: string | null, account: string | null, refused: string | null = null): string | null {
  if (!flag) return null;
  if (flag === "connected") return account ? `Reconnected as ${account}.` : "Google connected.";
  if (flag === "not_allowed" && refused) return `That Google account isn't allowed here: ${refused} was turned away and nothing was stored. Only the account named in GOOGLE_ALLOWED_ACCOUNTS on the server can connect.`;
  return GOOGLE_FLAGS[flag] ?? null;
}

/** The Google row's subtitle: what is actually true of the connection (0186). */
function googleDescription(input: { connected: boolean; account: string | null; syncError: string | null; lastSynced: string | null; now: Date }): { text: string; level: "ok" | "amber" | "red" | "never" | "off" } {
  if (!input.connected) return { text: "Not connected. Connect to show your Personal calendar and UK holidays on the calendar page and to sync the Family calendar.", level: "off" };
  if (input.syncError) return { text: `Google rejected the saved token (${input.syncError}). Nothing syncs until you reconnect.`, level: "red" };
  const who = input.account ? `Connected as ${input.account}` : "Connected, account unknown — reconnect to confirm";
  const s = staleness(input.lastSynced, input.now);
  return { text: `${who} · ${s.level === "never" ? "Not synced yet" : s.label}`, level: s.level };
}

const LEVEL_TEXT: Record<"ok" | "amber" | "red" | "never" | "off", string> = { ok: "text-text-lo", amber: "text-warn", red: "text-danger", never: "text-text-lo", off: "text-text-lo" };

function IntegrationsSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const googleConnected = !!settings.google_refresh_token;
  // set by lib/google/calendar.ts when Google refuses the refresh token (0150, MYC-147)
  const googleSyncError = (settings as { google_sync_error?: string | null }).google_sync_error ?? null;
  // which account connected (0184; family calendar spec §4.5)
  const googleAccount = (settings as { google_account_email?: string | null }).google_account_email ?? null;
  const needsReconnect = googleConnected && !!googleSyncError;
  // when the connection last read or wrote (0186); SYNC NOW moves it in place
  const [lastSynced, setLastSynced] = useState<string | null>((settings as { google_last_synced_at?: string | null }).google_last_synced_at ?? null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const params = useSearchParams();
  const googleFlag = params.get("google");
  const googleNotice = googleNoticeFor(googleFlag, googleAccount, params.get("account"));
  const googleLine = googleDescription({ connected: googleConnected, account: googleAccount, syncError: googleSyncError, lastSynced, now: new Date() });

  async function disconnectGoogle() {
    await onPatch({
      google_refresh_token: null,
      google_access_token: null,
      google_token_expires_at: null,
      google_sync_error: null,
      google_account_email: null,
      google_last_synced_at: null,
    });
    setLastSynced(null);
  }

  async function syncGoogle() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.error) setSyncResult(String(data.error));
        else {
          setSyncResult(`✓ Synced ${data.synced} events${data.updated?.length ? `, ${data.updated.length} updated` : ""}`);
          if (typeof data.last_synced_at === "string") setLastSynced(data.last_synced_at);
        }
      } else {
        setSyncResult("Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  }

  return (
    <SectionCard title="INTEGRATIONS">
      {googleNotice ? (
        <p role="status" className={`mb-3 text-xs ${googleFlag === "connected" ? "text-ok" : "text-danger"}`} data-testid="google-notice">
          {googleNotice}
        </p>
      ) : null}
      <IntegrationRow
        name="Google Calendar"
        description={googleLine.text}
        descriptionClass={LEVEL_TEXT[googleLine.level]}
        status={needsReconnect ? "Reconnect needed" : googleConnected ? "Connected" : "Not connected"}
        statusOk={googleConnected && !needsReconnect}
        action={
          googleConnected ? (
            <div className="flex items-center gap-2">
              {/* Plain anchors, not <Link>: the router prefetches a Link's href and every prefetch of /api/google/auth
                  minted a new state cookie, so reconnecting always came back as bad_state (lib/google/oauth.ts). */}
              {needsReconnect && (
                <a
                  href="/api/google/auth"
                  className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
                >
                  RECONNECT
                </a>
              )}
              {syncResult ? (
                <Mono className="text-[10px] text-ok">{syncResult}</Mono>
              ) : (
                <button
                  type="button"
                  onClick={syncGoogle}
                  disabled={syncing}
                  className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)] disabled:opacity-50"
                >
                  {syncing ? "SYNCING…" : "SYNC NOW"}
                </button>
              )}
              <button
                type="button"
                onClick={disconnectGoogle}
                className="text-[10px] text-danger hover:underline font-[family-name:var(--font-mono)]"
              >
                DISCONNECT
              </button>
            </div>
          ) : (
            <a
              href="/api/google/auth"
              className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
            >
              CONNECT
            </a>
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
            <Mono className="text-[10px] text-text-lo">Connected</Mono>
          ) : (
            <a
              href="/api/spotify/authorize"
              className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
            >
              CONNECT
            </a>
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
      <IntegrationRow
        name="Fitness Shortcut Setup"
        description="iOS Shortcut → workout capture pipeline"
        status="Configure"
        statusOk={false}
        action={
          <Link
            href="/fitness/shortcut-setup"
            className="text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]"
          >
            OPEN →
          </Link>
        }
      />
    </SectionCard>
  );
}

function IntegrationRow({
  name,
  description,
  descriptionClass = "text-text-lo",
  status,
  statusOk,
  action,
}: {
  name: string;
  description: string;
  /** colour of the subtitle: the Google row goes amber past an hour and red past a day (0186) */
  descriptionClass?: string;
  status: string;
  statusOk: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-hi">{name}</div>
        <div className={`text-xs ${descriptionClass}`} data-testid={name === "Google Calendar" ? "google-subtitle" : undefined}>{description}</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${statusOk ? "bg-ok" : "bg-text-lo"}`}
        />
        <Mono className="text-[10px] text-text-lo">{status}</Mono>
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
      <div className="text-xs text-text-lo mb-1">
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
              className="w-10 bg-surface-0 border border-hairline rounded-v2-md text-sm text-center text-text-hi py-1.5 outline-none focus:border-accent"
              title="Icon"
            />
            <input
              type="text"
              value={source.label}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], label: e.target.value } }))}
              onBlur={() => save(key, "label", drafts[key].label)}
              className="flex-1 bg-surface-0 border border-hairline rounded-v2-md text-sm text-text-hi px-3 py-1.5 outline-none focus:border-accent"
              title="Label"
            />
            <Mono className="text-[9px] text-text-lo w-16 text-right shrink-0">{key}</Mono>
            <button
              type="button"
              onClick={() => save(key, "visible", !source.visible)}
              className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
                source.visible ? "bg-ok" : "bg-text-lo"
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

type AiModelsPayload = {
  priced: Array<{ id: string; label: string; provider: string; usdPerMTok: [number, number] }>;
  in_use: Array<{ role: string; model: string }>;
  models: Array<{ provider: string; model_id: string; display_name: string | null; released_at: string | null; first_seen: string; last_seen: string; retired_at: string | null }> | null;
};

/**
 * Only a model priced in lib/config/models.ts can be chosen (MYC-190). The
 * routes use the models the environment names; the two choices here are
 * stored for routes that read a per-person model, and nothing switches on
 * its own. The instance owner also sees the live list the daily tick keeps.
 */
function AIConfigSection({ settings, onPatch }: { settings: Settings; onPatch: (f: Record<string, unknown>) => void }) {
  const [live, setLive] = useState<AiModelsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/models")
      .then((r) => (r.ok ? (r.json() as Promise<AiModelsPayload>) : null))
      .then((j) => {
        if (!cancelled && j) setLive(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const priced = live?.priced ?? [];
  const options = priced.map((m) => ({ value: m.id, label: `${m.label} · $${m.usdPerMTok[0]}/$${m.usdPerMTok[1]} per MTok` }));
  // A stored choice that is no longer priced stays visible, marked, until another is chosen.
  const withCurrent = (v: string) => (options.some((o) => o.value === v) ? options : [{ value: v, label: `${v} (not priced: choose another)` }, ...options]);
  const primary = String(settings.anthropic_model ?? "claude-sonnet-4-5");
  const categorisation = String(settings.ai_spending_categorisation_model ?? "claude-haiku-4-5");
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const pricedIds = new Set(priced.map((m) => m.id));

  return (
    <SectionCard title="AI CONFIG">
      <SelectSetting label="Primary model" value={primary} options={withCurrent(primary)} onSave={(v) => onPatch({ anthropic_model: v })} />
      <SelectSetting label="Categorisation model" value={categorisation} options={withCurrent(categorisation)} onSave={(v) => onPatch({ ai_spending_categorisation_model: v })} />
      <div className="text-[10px] text-text-lo italic font-[family-name:var(--font-display)]">
        Only models with a price on file can be chosen. Nothing switches on its own.
      </div>
      {live && (
        <div className="flex flex-col gap-1" data-testid="ai-in-use">
          <Mono className="text-[10px] text-text-lo tracking-[0.12em]">IN USE NOW</Mono>
          <ul className="text-xs text-text-mid">
            {live.in_use.map((u) => (
              <li key={u.role}>
                {u.role}: <span className="font-[family-name:var(--font-mono)]">{u.model}</span>
                {!pricedIds.has(u.model) && <span className="text-text-lo"> · not priced</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {live?.models && (
        <div className="flex flex-col gap-1" data-testid="ai-live-list">
          <Mono className="text-[10px] text-text-lo tracking-[0.12em]">SEEN AT THE PROVIDERS</Mono>
          {live.models.length === 0 ? (
            <p className="text-xs text-text-lo">Nothing yet: the list is read once a day, at five in the morning.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-lo">
                  <th className="font-normal py-1 pr-2">Model</th>
                  <th className="font-normal py-1 pr-2">First seen</th>
                  <th className="font-normal py-1 pr-2">Last seen</th>
                  <th className="font-normal py-1">State</th>
                </tr>
              </thead>
              <tbody>
                {live.models.map((m) => (
                  <tr key={`${m.provider}/${m.model_id}`} className="border-t border-hairline text-text-mid">
                    <td className="py-1 pr-2 font-[family-name:var(--font-mono)]">
                      {m.model_id}
                      <span className="text-text-lo"> · {m.provider}</span>
                    </td>
                    <td className="py-1 pr-2">{day(m.first_seen)}</td>
                    <td className="py-1 pr-2">{day(m.last_seen)}</td>
                    <td className="py-1">{m.retired_at ? `retired ${day(m.retired_at)}` : pricedIds.has(m.model_id) ? "priced" : "seen"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
            <div key={s.label} className="rounded-v2-md bg-surface-0 px-3 py-2">
              <div className="text-sm text-text-hi font-[family-name:var(--font-display)]">
                {s.count.toLocaleString()}
              </div>
              <Mono className="text-[9px] text-text-lo">{s.label}</Mono>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-text-lo italic font-[family-name:var(--font-display)] mt-1">
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
      className={`text-left px-3 py-2 rounded-v2-md border text-xs font-[family-name:var(--font-mono)] tracking-[0.08em] transition-colors ${
        confirming
          ? "border-danger bg-danger/10 text-danger"
          : "border-hairline text-text-lo hover:text-danger hover:border-danger/40"
      }`}
    >
      {confirming ? "Click again to confirm" : label}
    </button>
  );
}
