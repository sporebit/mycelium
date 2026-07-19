"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Home as HomeIcon, Plus, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { SECTIONS, type SectionConfig } from "@/lib/nav/sections";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { Sheet, Label } from "@/components/ui";
import { SECTION_ICONS } from "./sectionIcons";

const MAX_PINNED = 4;
const DASHBOARD_KEY = "dashboard";

type TabDef = {
  key: string;
  label: string;
  href: string;
  Icon: React.ComponentType<{ size?: number }>;
  match: (pathname: string) => boolean;
};

function tabForKey(key: string): TabDef | null {
  if (key === DASHBOARD_KEY) {
    return {
      key,
      label: "Dashboard",
      href: "/",
      Icon: HomeIcon,
      match: (p) => p === "/",
    };
  }
  const s = SECTIONS.find((sec) => sec.key === key);
  if (!s) return null;
  return {
    key,
    label: s.label,
    href: s.baseRoute,
    Icon: SECTION_ICONS[s.key] ?? MoreHorizontal,
    match: (p) => p === s.baseRoute || p.startsWith(s.baseRoute + "/"),
  };
}

function openCapture() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("open-capture"));
}

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { prefs, setPrefs } = useUiPrefs();
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingPins, setEditingPins] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const hidden = new Set(prefs.hidden_sections);
  const pinned = prefs.pinned_mobile_tabs
    .map(tabForKey)
    .filter((t): t is TabDef => !!t)
    .slice(0, MAX_PINNED);

  const togglePin = useCallback(
    (key: string) => {
      const cur = prefs.pinned_mobile_tabs;
      if (cur.includes(key)) {
        void setPrefs({ pinned_mobile_tabs: cur.filter((k) => k !== key) });
        setPinError(null);
        return;
      }
      if (cur.length >= MAX_PINNED) {
        setPinError("Unpin one first");
        return;
      }
      setPinError(null);
      void setPrefs({ pinned_mobile_tabs: [...cur, key] });
    },
    [prefs.pinned_mobile_tabs, setPrefs],
  );

  const isPinned = (key: string) => prefs.pinned_mobile_tabs.includes(key);
  const remainingSections = SECTIONS.filter((s) => !hidden.has(s.key));

  function handleMoreItemClick(section: SectionConfig) {
    if (editingPins) {
      togglePin(section.key);
      return;
    }
    router.push(section.baseRoute);
    setMoreOpen(false);
  }

  return (
    <>
      <nav
        aria-label="Primary (mobile)"
        className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-surface-1 border-t border-hairline-strong"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative grid grid-cols-5 h-14">
          {/* First two pinned */}
          {pinned.slice(0, 2).map((t) => (
            <TabButton key={t.key} tab={t} active={t.match(pathname)} />
          ))}

          {/* Centre FAB slot (no tab there — it's the raised button) */}
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={openCapture}
              aria-label="Capture"
              className="absolute -top-6 h-14 w-14 rounded-full bg-glow text-surface-0 shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:brightness-95 transition-[filter] duration-[var(--dur-fast)] flex items-center justify-center"
            >
              <Plus size={24} />
            </button>
          </div>

          {/* Last two pinned */}
          {pinned.slice(2, 4).map((t) => (
            <TabButton key={t.key} tab={t} active={t.match(pathname)} />
          ))}

          {/* Fill empty slots if fewer than 4 pinned so More stays in slot 5 */}
          {pinned.length < 4 &&
            Array.from({ length: 4 - pinned.length }).map((_, i) => (
              <span key={`empty-${i}`} aria-hidden />
            ))}

          <button
            type="button"
            onClick={() => {
              setMoreOpen(true);
              setEditingPins(false);
              setPinError(null);
            }}
            aria-label="More"
            className="flex flex-col items-center justify-center gap-0.5 text-text-lo hover:text-text-mid transition-colors"
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] tracking-[0.04em]">More</span>
          </button>
        </div>
      </nav>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        side="bottom"
        title="Sections"
      >
        <div className="flex items-center justify-between mb-3">
          <Label>All sections</Label>
          <button
            type="button"
            onClick={() => {
              setEditingPins((v) => !v);
              setPinError(null);
            }}
            className={`text-[11px] uppercase tracking-[0.08em] px-2.5 py-1 rounded-v2-sm transition-colors ${
              editingPins
                ? "bg-glow-wash text-text-hi"
                : "text-text-lo hover:text-text-mid"
            }`}
          >
            {editingPins ? "Done" : "Edit pinned"}
          </button>
        </div>
        {pinError && (
          <div className="mb-2 text-[11px] text-v2-error">{pinError}</div>
        )}
        <ul className="flex flex-col gap-1 pb-2">
          {remainingSections.map((section) => {
            const Icon = SECTION_ICONS[section.key] ?? MoreHorizontal;
            const active = tabForKey(section.key)?.match(pathname) ?? false;
            const pinnedNow = isPinned(section.key);
            return (
              <li key={section.key}>
                <button
                  type="button"
                  onClick={() => handleMoreItemClick(section)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-v2-md transition-colors ${
                    active
                      ? "bg-glow-wash text-text-hi"
                      : "text-text-mid hover:bg-surface-2"
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left">{section.label}</span>
                  {editingPins ? (
                    pinnedNow ? (
                      <PinOff size={16} className="text-text-lo" />
                    ) : (
                      <Pin size={16} className="text-text-lo" />
                    )
                  ) : pinnedNow ? (
                    <Pin size={12} className="text-glow-dim" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

function TabButton({ tab, active }: { tab: TabDef; active: boolean }) {
  const Icon = tab.Icon;
  return (
    <Link
      href={tab.href}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-glow-dim" : "text-text-lo hover:text-text-mid"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-1 h-1 w-1 rounded-full bg-glow-dim"
        />
      )}
      <Icon size={20} />
      <span className="text-[10px] tracking-[0.04em]">{tab.label}</span>
    </Link>
  );
}
