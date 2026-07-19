"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Home as HomeIcon,
  Settings as SettingsIcon,
  PlusCircle,
  MoreHorizontal,
} from "lucide-react";
import { SECTIONS, type SectionConfig, type SubPage } from "@/lib/nav/sections";
import { Wordmark } from "@/components/dashboard/Wordmark";
import { PrivacyToggle } from "@/components/dashboard/PrivacyToggle";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { SECTION_ICONS } from "./sectionIcons";

function isSectionActive(pathname: string, section: SectionConfig): boolean {
  return (
    pathname === section.baseRoute ||
    pathname.startsWith(section.baseRoute + "/")
  );
}

function isSubActive(pathname: string, sp: SubPage): boolean {
  return pathname === sp.href || pathname.startsWith(sp.href + "/");
}

function openCapture() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("open-capture"));
}

export function Sidebar() {
  const pathname = usePathname();
  const { prefs, setPrefs } = useUiPrefs();
  const collapsed = prefs.sidebar_collapsed;
  const hiddenSet = new Set(prefs.hidden_sections);

  const toggleCollapse = useCallback(() => {
    void setPrefs({ sidebar_collapsed: !collapsed });
  }, [collapsed, setPrefs]);

  const activeKey =
    SECTIONS.find((s) => isSectionActive(pathname, s))?.key ?? null;

  return (
    <aside
      aria-label="Primary navigation"
      className={`hidden lg:flex sticky top-0 h-screen flex-col bg-surface-0 border-r border-hairline-strong shrink-0 overflow-hidden motion-safe:transition-[width] motion-safe:duration-[var(--dur-base)] motion-safe:[transition-timing-function:var(--ease-out)] ${
        collapsed ? "w-16" : "w-[232px]"
      }`}
    >
      <div className="flex items-center h-14 px-3 border-b border-hairline">
        {collapsed ? (
          <Link
            href="/"
            aria-label="Home"
            className="mx-auto inline-flex items-center justify-center h-8 w-8 rounded-v2-md hover:bg-surface-2 text-text-mid hover:text-text-hi transition-colors"
          >
            <HomeIcon size={18} />
          </Link>
        ) : (
          <div className="flex-1 min-w-0">
            <Wordmark />
          </div>
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-2"
        aria-label="Sections"
      >
        {!collapsed && (
          <SidebarLink
            href="/"
            icon={<HomeIcon size={18} />}
            label="Dashboard"
            active={pathname === "/"}
            accent="var(--glow)"
          />
        )}
        {collapsed && (
          <IconOnlyLink
            href="/"
            icon={<HomeIcon size={18} />}
            label="Dashboard"
            active={pathname === "/"}
          />
        )}

        {SECTIONS.filter((s) => !hiddenSet.has(s.key)).map((section) => {
          const Icon = SECTION_ICONS[section.key] ?? MoreHorizontal;
          const active = section.key === activeKey;
          if (collapsed) {
            return (
              <IconOnlyLink
                key={section.key}
                href={section.baseRoute}
                icon={<Icon size={18} />}
                label={section.label}
                active={active}
                accent={section.colour}
              />
            );
          }
          return (
            <div key={section.key}>
              <SidebarLink
                href={section.baseRoute}
                icon={<Icon size={18} />}
                label={section.label}
                active={active}
                accent={section.colour}
              />
              <div
                className={`grid ${
                  active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                } motion-safe:transition-[grid-template-rows] motion-safe:duration-[var(--dur-base)] motion-safe:[transition-timing-function:var(--ease-out)]`}
              >
                <ul className="overflow-hidden ml-9 border-l border-hairline pl-2 py-0.5">
                  {section.subPages.map((sp) => {
                    const subActive = isSubActive(pathname, sp);
                    return (
                      <li key={sp.href}>
                        <Link
                          href={sp.href}
                          className={`block px-2.5 py-1.5 rounded-v2-sm text-[13px] transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
                            subActive
                              ? "bg-glow-wash text-text-hi"
                              : "text-text-lo hover:text-text-mid"
                          }`}
                        >
                          {sp.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-2 flex items-center gap-1">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 w-full">
            <button
              type="button"
              onClick={openCapture}
              title="Capture"
              aria-label="Capture"
              className="inline-flex items-center justify-center h-9 w-9 rounded-v2-md bg-glow text-surface-0 hover:brightness-95 transition-[filter] duration-[var(--dur-fast)]"
            >
              <PlusCircle size={18} />
            </button>
            <Link
              href="/other/settings"
              title="Settings"
              aria-label="Settings"
              className="inline-flex items-center justify-center h-9 w-9 rounded-v2-md text-text-mid hover:text-text-hi hover:bg-surface-2 transition-colors"
            >
              <SettingsIcon size={18} />
            </Link>
            <div className="flex justify-center">
              <PrivacyToggle />
            </div>
            <button
              type="button"
              onClick={toggleCollapse}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="inline-flex items-center justify-center h-9 w-9 rounded-v2-md text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={openCapture}
              className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-v2-md bg-glow text-surface-0 hover:brightness-95 transition-[filter] duration-[var(--dur-fast)] text-sm font-medium"
            >
              <PlusCircle size={16} />
              Capture
            </button>
            <Link
              href="/other/settings"
              title="Settings"
              aria-label="Settings"
              className="inline-flex items-center justify-center h-9 w-9 rounded-v2-md text-text-mid hover:text-text-hi hover:bg-surface-2 transition-colors"
            >
              <SettingsIcon size={18} />
            </Link>
            <div className="inline-flex items-center">
              <PrivacyToggle />
            </div>
            <button
              type="button"
              onClick={toggleCollapse}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="inline-flex items-center justify-center h-9 w-9 rounded-v2-md text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 mx-1 pl-3 pr-3 py-2 rounded-v2-md text-sm transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
        active
          ? "bg-glow-wash text-text-hi"
          : "text-text-mid hover:bg-surface-2 hover:text-text-hi"
      }`}
      style={
        active && accent
          ? { boxShadow: `inset 2px 0 0 0 ${accent}` }
          : undefined
      }
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function IconOnlyLink({
  href,
  icon,
  label,
  active,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center justify-center mx-1 h-10 rounded-v2-md transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
        active
          ? "bg-glow-wash text-text-hi"
          : "text-text-mid hover:bg-surface-2 hover:text-text-hi"
      }`}
      style={
        active && accent
          ? { boxShadow: `inset 2px 0 0 0 ${accent}` }
          : undefined
      }
    >
      <span aria-hidden>{icon}</span>
    </Link>
  );
}
