"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { JournalIcon } from "@/components/icons/nav/JournalIcon";
import { usePrivacy } from "@/lib/context/PrivacyContext";
import { useInstallPrompt } from "@/lib/hooks/useInstallPrompt";
import type { NavIconProps } from "@/components/icons/nav/types";

type Item = {
  label: string;
  href: string;
  Icon: ComponentType<NavIconProps>;
};

/** £ glyph in a circle — a "finance" icon that fits the existing nav set. */
function FinanceIcon({ size = 22, ariaLabel = "Finance" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx="20" cy="20" r="14" />
      <path d="M24 13 Q19 12 17 16 L17 22 L14 22 M14 25 L23 25 M17 25 L17 22 L20 22" />
    </svg>
  );
}

/** Heart silhouette for /health. */
function HealthIcon({ size = 22, ariaLabel = "Health" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M20 32 C 10 25, 6 18, 10 13 C 14 8, 18 11, 20 14 C 22 11, 26 8, 30 13 C 34 18, 30 25, 20 32 Z" />
    </svg>
  );
}

/** Clipboard for /review. */
function ReviewIcon({ size = 22, ariaLabel = "Review" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <rect x="11" y="9" width="18" height="24" rx="2" />
      <path d="M16 9 L16 6 L24 6 L24 9" />
      <path d="M15 17 L25 17 M15 22 L25 22 M15 27 L21 27" />
    </svg>
  );
}

/** Gear/cog for /more settings rows. */
function SettingsIcon({ size = 22, ariaLabel = "Settings" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx="20" cy="20" r="4" />
      <path d="M20 6 L20 10 M20 30 L20 34 M6 20 L10 20 M30 20 L34 20 M10 10 L13 13 M27 27 L30 30 M30 10 L27 13 M13 27 L10 30" />
    </svg>
  );
}

/** Bell for notifications. */
function BellIcon({ size = 22, ariaLabel = "Notifications" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M20 6 C 14 6, 10 11, 10 17 L10 24 L8 27 L32 27 L30 24 L30 17 C 30 11, 26 6, 20 6 Z" />
      <path d="M16 27 C16 30 18 33 20 33 C22 33 24 30 24 27" />
    </svg>
  );
}

/** Download/install icon. */
function InstallIcon({ size = 22, ariaLabel = "Install" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M20 6 L20 26 M14 20 L20 26 L26 20" />
      <path d="M10 30 L30 30" />
    </svg>
  );
}

/** Apple-ish food disc for /nutrition. */
function NutritionIcon({ size = 22, ariaLabel = "Nutrition" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M20 11 C 12 11, 8 18, 12 27 C 14 31, 18 32, 20 30 C 22 32, 26 31, 28 27 C 32 18, 28 11, 20 11 Z" />
      <path d="M20 11 L20 7 M20 7 L23 5" />
    </svg>
  );
}

/** Desktop/monitor icon for /pc-build. */
function PcBuildIcon({ size = 22, ariaLabel = "PC Build" }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
    >
      <rect x="8" y="8" width="24" height="18" rx="2" />
      <path d="M15 26 L25 26 M20 26 L20 32 M14 32 L26 32" />
    </svg>
  );
}

const SECTIONS: Item[] = [
  { label: "Finance", href: "/finance", Icon: FinanceIcon },
  { label: "Health", href: "/health", Icon: HealthIcon },
  { label: "Nutrition", href: "/health/nutrition", Icon: NutritionIcon },
  { label: "Journal", href: "/journal", Icon: JournalIcon },
  { label: "Review", href: "/review", Icon: ReviewIcon },
  { label: "PC Build", href: "/pc-build", Icon: PcBuildIcon },
];

function Chevron(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 3 L9 7 L5 11" />
    </svg>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-4 mb-2 px-1">
      {children}
    </h2>
  );
}

export function MoreList() {
  const { financeHidden, toggle } = usePrivacy();
  const install = useInstallPrompt();
  const [notifEnabled, setNotifEnabled] = useState(
    () => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted",
  );
  const [notifLoading, setNotifLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleNotifToggle() {
    if (notifLoading) return;
    setNotifLoading(true);

    try {
      if (notifEnabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setNotifEnabled(false);
        setToast("Notifications disabled");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setToast("Permission denied");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          setToast("VAPID key not configured");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        const json = sub.toJSON();
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setToast((j as { error?: string }).error ?? "Subscribe failed");
          return;
        }
        setNotifEnabled(true);
        setToast("Notifications enabled");
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed");
    } finally {
      setNotifLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function handleTestPush() {
    if (testSending) return;
    setTestSending(true);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Mycelium",
          body: "Test notification — push is working.",
          url: "/more",
        }),
      });
      const j = (await res.json()) as { sent?: number };
      setToast(`Sent to ${j.sent ?? 0} device(s)`);
    } catch {
      setToast("Send failed");
    } finally {
      setTestSending(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        More
      </h1>

      {/* Install prompt */}
      {install.state.kind !== "hidden" && (
        <div className="rounded-md bg-ink-1 border border-ink-2 px-4 py-3 flex items-center gap-3">
          <InstallIcon size={22} ariaLabel="Install" />
          <div className="flex-1">
            {install.state.kind === "android" ? (
              <button
                type="button"
                onClick={install.state.prompt}
                className="text-sm text-text-0 hover:text-accent transition-colors"
              >
                Install Mycelium
              </button>
            ) : (
              <span className="text-sm text-ink-3">
                Add to Home Screen via Share
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={install.dismiss}
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            Dismiss
          </button>
        </div>
      )}

      <GroupHeading>Settings</GroupHeading>
      <ul className="flex flex-col gap-2">
        <li>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={financeHidden}
            className="w-full flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
          >
            <SettingsIcon size={22} ariaLabel="Privacy mode" />
            <div className="flex-1">
              <div className="text-base text-text-0">Privacy mode</div>
              <div className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase">
                Redact financial values (resets on reload)
              </div>
            </div>
            <span
              className={`text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md border ${
                financeHidden
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3"
              }`}
            >
              {financeHidden ? "ON" : "OFF"}
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={handleNotifToggle}
            disabled={notifLoading}
            className="w-full flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
          >
            <BellIcon size={22} ariaLabel="Notifications" />
            <div className="flex-1">
              <div className="text-base text-text-0">Enable notifications</div>
              <div className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase">
                {notifLoading ? "Working…" : "Push notifications for reminders"}
              </div>
            </div>
            <span
              className={`text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md border ${
                notifEnabled
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3"
              }`}
            >
              {notifEnabled ? "ON" : "OFF"}
            </span>
          </button>
        </li>
        {notifEnabled && (
          <li>
            <button
              type="button"
              onClick={handleTestPush}
              disabled={testSending}
              className="w-full flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
            >
              <BellIcon size={22} ariaLabel="Test" />
              <div className="flex-1">
                <div className="text-base text-text-0">
                  {testSending ? "Sending…" : "Send test notification"}
                </div>
              </div>
            </button>
          </li>
        )}
      </ul>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] bg-ink-1 text-text-0 border border-ink-2"
        >
          {toast}
        </div>
      )}

      <GroupHeading>Sections</GroupHeading>
      <ul className="flex flex-col gap-2">
        {SECTIONS.map((item) => {
          const Icon = item.Icon;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors"
              >
                <Icon size={22} ariaLabel={item.label} />
                <span className="flex-1 text-base text-text-0">
                  {item.label}
                </span>
                <span className="text-ink-3">
                  <Chevron />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
